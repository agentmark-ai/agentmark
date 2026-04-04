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
                data["ast"], experiment_id, data.get("datasetPath"),
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
        from opentelemetry.sdk.trace.export import SimpleSpanProcessor, SpanExporter, SpanExportResult

        base_url = f"http://localhost:{api_server_port}"

        class _JsonOtlpExporter(SpanExporter):
            """Custom exporter that sends OTLP JSON to the AgentMark API server."""

            def __init__(self, endpoint: str) -> None:
                self._endpoint = endpoint

            def export(self, spans: Any) -> SpanExportResult:
                import json as _json
                import urllib.request

                resource_spans = _spans_to_otlp_json(spans)
                payload = _json.dumps({"resourceSpans": resource_spans}).encode()

                req = urllib.request.Request(
                    self._endpoint,
                    data=payload,
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": "dev",
                        "X-Agentmark-App-Id": "dev",
                    },
                    method="POST",
                )
                try:
                    with urllib.request.urlopen(req, timeout=5) as resp:
                        if resp.status < 300:
                            return SpanExportResult.SUCCESS
                        return SpanExportResult.FAILURE
                except Exception as e:
                    print(f"Trace export failed: {e}")
                    return SpanExportResult.FAILURE

            def shutdown(self) -> None:
                pass

        resource = Resource.create({"service.name": "agentmark-webhook"})
        provider = TracerProvider(resource=resource)
        exporter = _JsonOtlpExporter(f"{base_url}/v1/traces")
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


def _spans_to_otlp_json(spans: list) -> list:
    """Convert OTEL SDK spans to OTLP JSON resourceSpans format."""
    if not spans:
        return []

    from collections import defaultdict

    # Group spans by resource, then by scope
    groups: dict = {}  # res_key -> (resource, {scope_name -> [span_json]})

    for span in spans:
        res_key = id(span.resource)
        if res_key not in groups:
            groups[res_key] = (span.resource, defaultdict(list))

        scope_name = "unknown"
        if hasattr(span, "instrumentation_scope") and span.instrumentation_scope:
            scope_name = span.instrumentation_scope.name
        elif hasattr(span, "instrumentation_info") and span.instrumentation_info:
            scope_name = span.instrumentation_info.name

        groups[res_key][1][scope_name].append(_span_to_json(span))

    resource_spans = []
    for resource, scope_spans in groups.values():
        resource_spans.append({
            "resource": {
                "attributes": _attrs_to_json(resource.attributes) if resource else [],
            },
            "scopeSpans": [
                {"scope": {"name": name}, "spans": spans_json}
                for name, spans_json in scope_spans.items()
            ],
        })

    return resource_spans


def _span_to_json(span: Any) -> dict:
    """Convert a single SDK span to OTLP JSON format."""
    ctx = span.get_span_context()
    parent = span.parent

    result: dict = {
        "traceId": format(ctx.trace_id, "032x"),
        "spanId": format(ctx.span_id, "016x"),
        "name": span.name,
        "kind": span.kind.value if hasattr(span.kind, "value") else 1,
        "startTimeUnixNano": str(span.start_time),
        "endTimeUnixNano": str(span.end_time or span.start_time),
        "attributes": _attrs_to_json(span.attributes),
        "status": {
            "code": span.status.status_code.value if hasattr(span.status.status_code, "value") else 0,
        },
    }

    if parent:
        parent_ctx = parent if hasattr(parent, "span_id") else None
        if parent_ctx:
            result["parentSpanId"] = format(parent_ctx.span_id, "016x")

    if span.status.description:
        result["status"]["message"] = span.status.description

    if span.events:
        result["events"] = [
            {
                "name": e.name,
                "timeUnixNano": str(e.timestamp),
                "attributes": _attrs_to_json(e.attributes),
            }
            for e in span.events
        ]

    return result


def _attrs_to_json(attrs: Any) -> list:
    """Convert attributes to OTLP JSON format."""
    if not attrs:
        return []
    result = []
    for key, value in dict(attrs).items():
        if isinstance(value, bool):
            result.append({"key": key, "value": {"boolValue": value}})
        elif isinstance(value, int):
            result.append({"key": key, "value": {"intValue": str(value)}})
        elif isinstance(value, float):
            result.append({"key": key, "value": {"doubleValue": value}})
        else:
            result.append({"key": key, "value": {"stringValue": str(value)}})
    return result


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
