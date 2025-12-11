"""Webhook server for AgentMark development with Pydantic AI.

This module provides create_webhook_server(), a factory function that creates
an aiohttp-based webhook server for executing AgentMark prompts during
development. This mirrors TypeScript's createWebhookServer in @agentmark/cli.

Example:
    from agentmark_pydantic_ai_v0 import create_pydantic_ai_client
    from agentmark_pydantic_ai_v0.server import create_webhook_server

    client = create_pydantic_ai_client()
    create_webhook_server(client, webhook_port=9417, api_server_port=9418)
"""

from __future__ import annotations

import json
import os
from typing import TYPE_CHECKING

from aiohttp import web

from .webhook import PydanticAIWebhookHandler

if TYPE_CHECKING:
    from agentmark.prompt_core import AgentMark


async def _handle_webhook(
    request: web.Request,
    handler: PydanticAIWebhookHandler,
) -> web.Response:
    """Handle incoming webhook requests."""
    try:
        body = await request.json()
        event_type = body.get("type")
        data = body.get("data", {})

        if not event_type:
            return web.json_response(
                {"message": "Missing event type"},
                status=400,
            )

        if event_type == "prompt-run":
            options = {
                "shouldStream": data.get("options", {}).get("shouldStream", True),
                "customProps": data.get("customProps"),
            }
            result = await handler.run_prompt(data["ast"], options)

            if result.get("type") == "stream":
                # Return streaming response
                response = web.StreamResponse()
                response.headers["Content-Type"] = "application/x-ndjson"
                response.headers["AgentMark-Streaming"] = "true"
                await response.prepare(request)

                async for chunk in result["stream"]:
                    await response.write(chunk.encode() + b"\n")

                if result.get("traceId"):
                    await response.write(
                        json.dumps({"type": "done", "traceId": result["traceId"]}).encode()
                        + b"\n"
                    )
                await response.write_eof()
                return response

            return web.json_response(result)

        elif event_type == "dataset-run":
            experiment_id = data.get("experimentId", "local-experiment")
            result = await handler.run_experiment(
                data["ast"],
                experiment_id,
                data.get("datasetPath"),
            )

            # Dataset runs always stream
            response = web.StreamResponse()
            response.headers["Content-Type"] = "application/x-ndjson"
            response.headers["AgentMark-Streaming"] = "true"
            await response.prepare(request)

            async for chunk in result["stream"]:
                await response.write(chunk.encode() + b"\n")

            await response.write_eof()
            return response

        return web.json_response(
            {"message": f"Unknown event type: {event_type}"},
            status=400,
        )

    except Exception as e:
        import traceback

        traceback.print_exc()
        return web.json_response(
            {"message": str(e)},
            status=500,
        )


async def _handle_root(_request: web.Request) -> web.Response:
    """Landing page for browser access."""
    html = """<!DOCTYPE html>
<html>
<head><title>AgentMark Python Dev Server</title></head>
<body>
<h1>AgentMark Python Webhook Server</h1>
<p>Server is running. Use the CLI to run prompts:</p>
<pre>npm run prompt agentmark/party-planner.prompt.mdx</pre>
</body>
</html>"""
    return web.Response(text=html, content_type="text/html")


def create_webhook_server(
    client: AgentMark,
    webhook_port: int = 9417,
    api_server_port: int = 9418,
) -> None:
    """Create and run a webhook server for AgentMark development.

    This function creates an aiohttp-based webhook server that handles
    prompt execution requests from the AgentMark CLI during development.

    Args:
        client: An AgentMark client configured with PydanticAIAdapter.
        webhook_port: Port for the webhook server (default: 9417).
        api_server_port: Port of the API server for telemetry (default: 9418).

    Example:
        from agentmark_pydantic_ai_v0 import create_pydantic_ai_client
        from agentmark_pydantic_ai_v0.server import create_webhook_server

        client = create_pydantic_ai_client()
        create_webhook_server(client, webhook_port=9417, api_server_port=9418)
    """
    # Set environment for development
    os.environ["AGENTMARK_BASE_URL"] = f"http://localhost:{api_server_port}"

    handler = PydanticAIWebhookHandler(client)

    async def webhook_handler(request: web.Request) -> web.Response:
        return await _handle_webhook(request, handler)

    app = web.Application()
    app.router.add_get("/", _handle_root)
    app.router.add_post("/", webhook_handler)

    print(f"Starting Python webhook server on port {webhook_port}")
    print(f"API server URL: http://localhost:{api_server_port}")
    web.run_app(app, port=webhook_port, print=False)
