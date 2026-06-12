"""Serve a :class:`WebhookRunner` over HTTP — Python's ``createWebhookServer``.

``agentmark dev`` spawns ``python .agentmark/dev_server.py --webhook-port=<N>
--api-server-port=<M>`` and expects that process to keep running and answer
webhook jobs over HTTP. TypeScript projects get that server from
``createWebhookServer`` (``@agentmark-ai/cli/runner-server``); this module is
the Python equivalent, so a dev-server entry point is just::

    runner = create_webhook_runner(client, executor)
    serve_webhook_runner(runner)   # parses --webhook-port, blocks serving

Wire contract (mirrors the TS dev server in ``cli-src/runner-server.ts`` and
the managed server in ``apps/builder``'s ``python-server-generator.ts``):

* ``POST /`` with a JSON ``{type, data}`` job → ``runner.dispatch(event)``.
* Non-streaming results are returned verbatim as a JSON body.
* Streaming results (``{"stream": <async iterator of NDJSON lines>, ...}``)
  are written line-by-line with ``AgentMark-Streaming: true`` and
  ``Content-Type: application/x-ndjson`` headers — clients (``agentmark
  run-prompt`` / ``run-experiment``) switch to NDJSON parsing on that header.
  When the result carries a ``traceId``, a final ``{"type": "done",
  "traceId": ...}`` line is appended after the stream drains, matching the TS
  dev server.
* Errors become ``{"message": ...}`` JSON bodies — 400 for bad input
  (invalid JSON, unknown job type, missing fields), 500 otherwise.
* ``GET /health`` answers ``ok`` for liveness probes.

All of the user's async code (the runner, the executor, any SDK clients it
caches) runs on ONE persistent event loop in a background thread — the same
single-loop semantics a uvicorn deployment gives the managed handler — so
loop-bound clients like ``httpx.AsyncClient`` survive across requests. HTTP
serving itself is the stdlib ``ThreadingHTTPServer``; request threads hand
coroutines to the loop and stream results back as they arrive.
"""

from __future__ import annotations

import asyncio
import json
import sys
import threading
from collections.abc import AsyncIterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

DEFAULT_WEBHOOK_PORT = 9417

_STREAM_HEADERS_DEFAULT = {"AgentMark-Streaming": "true"}


def parse_webhook_port(
    argv: list[str] | None = None, default: int = DEFAULT_WEBHOOK_PORT
) -> int:
    """Extract ``--webhook-port`` from CLI args (the flag ``agentmark dev``
    passes to the spawned dev server), in either ``--webhook-port=9417`` or
    ``--webhook-port 9417`` form. Unrelated flags (``--api-server-port``) are
    ignored. Falls back to ``default`` when the flag is absent.
    """
    args = sys.argv[1:] if argv is None else argv
    for i, arg in enumerate(args):
        if arg.startswith("--webhook-port="):
            value = arg.split("=", 1)[1]
        elif arg == "--webhook-port" and i + 1 < len(args):
            value = args[i + 1]
        else:
            continue
        try:
            return int(value)
        except ValueError as exc:
            raise ValueError(
                f"--webhook-port expects an integer, got {value!r}"
            ) from exc
    return default


class _EventLoopThread:
    """One persistent asyncio loop on a daemon thread.

    Every dispatch and every stream pull runs here, so user async code sees a
    single stable loop for the server's whole lifetime (per-request
    ``asyncio.run`` would orphan loop-bound state like httpx connection pools
    between requests).
    """

    def __init__(self) -> None:
        self.loop = asyncio.new_event_loop()
        self._thread = threading.Thread(
            target=self._run, name="agentmark-webhook-loop", daemon=True
        )
        self._thread.start()

    def _run(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, coro: Any) -> Any:
        return asyncio.run_coroutine_threadsafe(coro, self.loop).result()

    def close(self) -> None:
        self.loop.call_soon_threadsafe(self.loop.stop)
        self._thread.join(timeout=5)


async def _next_chunk(stream: AsyncIterator[Any]) -> tuple[bool, Any]:
    try:
        return False, await stream.__anext__()
    except StopAsyncIteration:
        return True, None


async def _close_stream(stream: AsyncIterator[Any]) -> None:
    aclose = getattr(stream, "aclose", None)
    if aclose is not None:
        await aclose()


class WebhookHTTPServer(ThreadingHTTPServer):
    """The HTTP server :func:`create_webhook_server` returns. ``close()`` stops
    both the listener and the background event loop."""

    daemon_threads = True

    def __init__(self, address: tuple[str, int], runner: Any) -> None:
        super().__init__(address, _WebhookRequestHandler)
        self.runner = runner
        self.loop_thread = _EventLoopThread()

    def close(self) -> None:
        self.shutdown()
        self.server_close()
        self.loop_thread.close()


class _WebhookRequestHandler(BaseHTTPRequestHandler):
    # Connection-close-delimited bodies (HTTP/1.0 framing) keep streaming
    # simple: no chunked encoding, the client reads until the socket closes.
    server: WebhookHTTPServer  # narrowed for attribute access below

    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 — stdlib signature
        sys.stderr.write(
            f"[agentmark] {self.address_string()} {format % args}\n"
        )

    def _send_json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 — stdlib naming
        if self.path in ("/", "/health"):
            body = b"ok" if self.path == "/health" else (
                b"AgentMark Python webhook server. POST {type, data} jobs to /."
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        self._send_json(404, {"message": f"Not found: {self.path}"})

    def do_POST(self) -> None:  # noqa: N802 — stdlib naming
        try:
            length = int(self.headers.get("Content-Length") or 0)
            event = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(event, dict):
                raise ValueError("request body must be a JSON object")
        except (ValueError, json.JSONDecodeError) as exc:
            self._send_json(400, {"message": f"Invalid request body: {exc}"})
            return

        try:
            result = self.server.loop_thread.run(self.server.runner.dispatch(event))
        except (ValueError, KeyError) as exc:
            # Unknown job type / missing fields — the caller's bug, not ours.
            self._send_json(400, {"message": str(exc)})
            return
        except Exception as exc:  # noqa: BLE001 — surface executor failures as HTTP 500
            self._send_json(500, {"message": str(exc)})
            return

        stream = result.get("stream") if isinstance(result, dict) else None
        if stream is not None and hasattr(stream, "__aiter__"):
            self._send_stream(result, stream)
            return
        self._send_json(200, result)

    def _send_stream(self, result: dict[str, Any], stream: AsyncIterator[Any]) -> None:
        headers: dict[str, str] = {
            "Content-Type": "application/x-ndjson",
            **_STREAM_HEADERS_DEFAULT,
            **(result.get("streamHeaders") or {}),
        }
        self.send_response(200)
        for key, value in headers.items():
            self.send_header(key, value)
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            while True:
                done, chunk = self.server.loop_thread.run(_next_chunk(stream))
                if done:
                    break
                line = chunk if isinstance(chunk, str) else json.dumps(chunk)
                if not line.endswith("\n"):
                    line += "\n"
                self.wfile.write(line.encode("utf-8"))
                self.wfile.flush()
            # Trailing done event mirrors the TS dev server: run-prompt /
            # run-experiment read the traceId off it to print the trace link.
            trace_id = result.get("traceId")
            if trace_id:
                self.wfile.write(
                    (json.dumps({"type": "done", "traceId": trace_id}) + "\n").encode("utf-8")
                )
        except (BrokenPipeError, ConnectionResetError):
            # Client went away mid-stream; release the generator's resources
            # (spans close in its finally block) and move on.
            self.server.loop_thread.run(_close_stream(stream))


def create_webhook_server(
    runner: Any, *, port: int = DEFAULT_WEBHOOK_PORT, host: str = "127.0.0.1"
) -> WebhookHTTPServer:
    """Bind the webhook server without blocking — the embeddable form (tests,
    custom entry points). Call ``serve_forever()`` to serve and ``close()`` to
    stop. ``port=0`` picks an ephemeral port (read it from ``server_port``).

    ``runner`` is anything with an async ``dispatch(event)`` — normally the
    :class:`WebhookRunner` from :func:`create_webhook_runner`.
    """
    return WebhookHTTPServer((host, port), runner)


def serve_webhook_runner(
    runner: Any, *, port: int | None = None, host: str = "127.0.0.1"
) -> None:
    """Serve ``runner`` over HTTP until interrupted — the one-call dev-server
    entry point. When ``port`` is omitted, reads ``--webhook-port`` from
    ``sys.argv`` (the flag ``agentmark dev`` passes), defaulting to 9417.
    """
    resolved_port = parse_webhook_port() if port is None else port
    server = create_webhook_server(runner, port=resolved_port, host=host)
    print(
        f"AgentMark webhook server listening on http://{host}:{server.server_port}",
        flush=True,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.close()
