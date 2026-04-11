"""Webhook server for AgentMark development with Claude Agent SDK.

Provides create_webhook_server(), an aiohttp-based webhook server for
executing AgentMark prompts during development via the CLI.
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING, Any

from aiohttp import web

from .webhook import ClaudeAgentWebhookHandler

_tracing_initialized = False

if TYPE_CHECKING:
    from agentmark.prompt_core import AgentMark


async def _handle_webhook(
    request: web.Request,
    handler: ClaudeAgentWebhookHandler,
) -> web.Response:
    """Handle incoming webhook requests."""
    try:
        body = await request.json()
        event_type = body.get("type")
        data = body.get("data", {})

        if not event_type:
            return web.json_response({"message": "Missing event type"}, status=400)

        if event_type == "prompt-run":
            options = data.get("options", {})
            should_stream = options.get("shouldStream", True)
            custom_props = data.get("customProps")

            result = await handler.run_prompt(
                data["ast"],
                should_stream=should_stream,
                custom_props=custom_props,
                telemetry={"isEnabled": True},
            )

            if hasattr(result, "type") and result.type == "stream":
                response = web.StreamResponse()
                response.headers["Content-Type"] = "application/x-ndjson"
                response.headers["AgentMark-Streaming"] = "true"
                await response.prepare(request)

                async for chunk in result.stream:
                    if isinstance(chunk, bytes):
                        await response.write(chunk if chunk.endswith(b"\n") else chunk + b"\n")
                    else:
                        encoded = chunk.encode()
                        await response.write(
                            encoded if encoded.endswith(b"\n") else encoded + b"\n"
                        )

                if result.trace_id:
                    await response.write(
                        json.dumps({"type": "done", "traceId": result.trace_id}).encode() + b"\n"
                    )
                await response.write_eof()
                return response

            return web.json_response({
                "type": result.type,
                "result": result.result,
                "usage": result.usage,
                "finishReason": result.finish_reason,
                "traceId": result.trace_id,
            })

        elif event_type == "dataset-run":
            experiment_id = data.get("experimentId", "local-experiment")
            result = await handler.run_experiment(
                data["ast"],
                experiment_id,
                data.get("datasetPath"),
                data.get("sampling"),
                data.get("commitSha"),
            )

            response = web.StreamResponse()
            response.headers["Content-Type"] = "application/x-ndjson"
            response.headers["AgentMark-Streaming"] = "true"
            await response.prepare(request)

            async for chunk in result.stream:
                if isinstance(chunk, bytes):
                    await response.write(chunk if chunk.endswith(b"\n") else chunk + b"\n")
                else:
                    encoded = chunk.encode()
                    await response.write(
                        encoded if encoded.endswith(b"\n") else encoded + b"\n"
                    )

            await response.write_eof()
            return response

        return web.json_response(
            {"message": f"Unknown event type: {event_type}"}, status=400
        )

    except Exception as e:
        import traceback
        traceback.print_exc()
        return web.json_response({"message": str(e)}, status=500)


async def _handle_root(_request: web.Request) -> web.Response:
    """Landing page."""
    html = """<!DOCTYPE html>
<html><head><title>AgentMark Dev Server</title></head>
<body>
<h1>AgentMark Claude Agent SDK Webhook Server</h1>
<p>Server is running. Use the CLI to run prompts.</p>
</body></html>"""
    return web.Response(text=html, content_type="text/html")


def _init_tracing(api_server_port: int) -> None:
    """Initialize OpenTelemetry tracing to export spans to the API server.

    Uses a custom JSON exporter since the AgentMark API server expects
    OTLP JSON format, not protobuf.
    """
    global _tracing_initialized
    if _tracing_initialized:
        return

    try:
        from opentelemetry import trace as otel_trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor

        from agentmark_sdk.otlp_json_exporter import JsonOtlpSpanExporter

        base_url = f"http://localhost:{api_server_port}"

        resource = Resource.create({"service.name": "agentmark-webhook"})
        provider = TracerProvider(resource=resource)
        exporter = JsonOtlpSpanExporter(
            endpoint=f"{base_url}/v1/traces",
            headers={"Authorization": "dev", "X-Agentmark-App-Id": "dev"},
        )
        # SimpleSpanProcessor exports synchronously — acceptable for local dev server.
        # For production use, switch to BatchSpanProcessor to avoid blocking the event loop.
        provider.add_span_processor(SimpleSpanProcessor(exporter))
        otel_trace.set_tracer_provider(provider)

        _tracing_initialized = True
        print(f"OpenTelemetry tracing initialized → {base_url}/v1/traces")
    except ImportError:
        print("Warning: opentelemetry SDK not installed, traces will not be exported")
    except Exception as e:
        print(f"Warning: Failed to initialize tracing: {e}")


def create_webhook_server(
    client: AgentMark,
    webhook_port: int = 9417,
    api_server_port: int = 9418,
    mcp_servers: dict | None = None,
) -> None:
    """Create and run a webhook server for AgentMark development.

    Args:
        client: An AgentMark client configured with ClaudeAgentAdapter.
        webhook_port: Port for the webhook server (default: 9417).
        api_server_port: Port of the API server for telemetry (default: 9418).
        mcp_servers: Optional default MCP servers to include in every query.
    """
    os.environ["AGENTMARK_BASE_URL"] = f"http://localhost:{api_server_port}"

    _init_tracing(api_server_port)

    handler = ClaudeAgentWebhookHandler(client, mcp_servers=mcp_servers)

    async def webhook_handler(request: web.Request) -> web.Response:
        return await _handle_webhook(request, handler)

    app = web.Application()
    app.router.add_get("/", _handle_root)
    app.router.add_post("/", webhook_handler)

    print(f"Starting Claude Agent SDK webhook server on port {webhook_port}")
    print(f"API server URL: http://localhost:{api_server_port}")
    web.run_app(app, port=webhook_port, print=False)
