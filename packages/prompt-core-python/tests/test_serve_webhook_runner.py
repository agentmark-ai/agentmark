"""HTTP serving for the dev-server entry point — ``serve_webhook_runner``.

This is the surface that broke onboarding: ``agentmark dev`` spawns
``python .agentmark/dev_server.py --webhook-port=N`` and expects an HTTP
server, but until this module Python had no equivalent of the TS
``createWebhookServer`` — the documented entry point built a runner and
exited. This suite pins the wire contract the CLI consumes
(``cli-src/commands/run-prompt.ts``): POST ``{type, data}`` →
``runner.dispatch``, NDJSON streaming gated on the ``AgentMark-Streaming``
header, a trailing ``{"type": "done", "traceId": ...}`` event, and
``{"message": ...}`` error bodies.
"""

from __future__ import annotations

import asyncio
import json
import threading
import urllib.error
import urllib.request
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core.serve_webhook_runner import (
    DEFAULT_WEBHOOK_PORT,
    WebhookHTTPServer,
    create_webhook_server,
    parse_webhook_port,
)


class StubRunner:
    """Dispatch stub: returns the canned result for the event's type and
    records every event it receives."""

    def __init__(self, results: dict[str, Any]) -> None:
        self.results = results
        self.events: list[dict[str, Any]] = []

    async def dispatch(self, event: dict[str, Any]) -> Any:
        self.events.append(event)
        result = self.results[event["type"]]
        if isinstance(result, Exception):
            raise result
        return result


@pytest.fixture
def serve() -> Any:
    servers: list[WebhookHTTPServer] = []

    def _start(runner: Any) -> tuple[WebhookHTTPServer, str]:
        server = create_webhook_server(runner, port=0)
        servers.append(server)
        threading.Thread(target=server.serve_forever, daemon=True).start()
        return server, f"http://127.0.0.1:{server.server_port}"

    yield _start
    for server in servers:
        server.close()


def _post(url: str, payload: dict[str, Any]) -> Any:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    return urllib.request.urlopen(req, timeout=10)


def test_non_streaming_result_returned_verbatim_as_json(serve: Any) -> None:
    payload = {
        "type": "text",
        "result": "hi",
        "usage": {"inputTokens": 1, "outputTokens": 2, "totalTokens": 3},
        "traceId": "t-1",
    }
    runner = StubRunner({"prompt-run": payload})
    _, url = serve(runner)

    res = _post(url, {"type": "prompt-run", "data": {"ast": {}}})

    assert res.status == 200
    assert res.headers.get("AgentMark-Streaming") is None
    assert json.loads(res.read()) == payload
    # The event reaches dispatch untouched — the server adds nothing.
    assert runner.events == [{"type": "prompt-run", "data": {"ast": {}}}]


def test_get_evals_round_trips_flat_payload(serve: Any) -> None:
    evals_payload = {"type": "evals", "result": ["exact-match"], "traceId": None}
    runner = StubRunner({"get-evals": evals_payload})
    _, url = serve(runner)

    res = _post(url, {"type": "get-evals", "data": {}})

    assert json.loads(res.read()) == evals_payload


def test_streaming_result_emits_ndjson_with_header_and_done_event(serve: Any) -> None:
    async def chunks() -> AsyncIterator[str]:
        yield json.dumps({"type": "text", "result": "he"}) + "\n"
        yield json.dumps({"type": "text", "result": "llo"}) + "\n"

    runner = StubRunner(
        {
            "prompt-run": {
                "type": "stream",
                "stream": chunks(),
                "streamHeaders": {"AgentMark-Streaming": "true"},
                "traceId": "trace-42",
            }
        }
    )
    _, url = serve(runner)

    res = _post(url, {"type": "prompt-run", "data": {"ast": {}}})

    assert res.status == 200
    assert res.headers.get("AgentMark-Streaming") == "true"
    assert res.headers.get("Content-Type") == "application/x-ndjson"
    lines = [json.loads(line) for line in res.read().decode().splitlines()]
    assert lines == [
        {"type": "text", "result": "he"},
        {"type": "text", "result": "llo"},
        {"type": "done", "traceId": "trace-42"},
    ]


def test_streaming_without_trace_id_omits_done_event(serve: Any) -> None:
    async def chunks() -> AsyncIterator[str]:
        yield json.dumps({"type": "dataset", "result": {"output": "x"}}) + "\n"

    runner = StubRunner({"dataset-run": {"stream": chunks()}})
    _, url = serve(runner)

    res = _post(url, {"type": "dataset-run", "data": {"ast": {}}})

    # Experiments stream with the default header even when the runner result
    # carries no explicit streamHeaders.
    assert res.headers.get("AgentMark-Streaming") == "true"
    lines = [json.loads(line) for line in res.read().decode().splitlines()]
    assert lines == [{"type": "dataset", "result": {"output": "x"}}]


def test_chunks_flush_before_stream_completes(serve: Any) -> None:
    """First NDJSON line must be readable while the generator is still
    blocked — pinning per-chunk flushing, not buffer-then-send."""
    gate: dict[str, Any] = {}

    async def chunks() -> AsyncIterator[str]:
        gate["event"] = asyncio.Event()
        yield json.dumps({"type": "text", "result": "first"}) + "\n"
        await gate["event"].wait()
        yield json.dumps({"type": "text", "result": "second"}) + "\n"

    runner = StubRunner({"prompt-run": {"stream": chunks(), "traceId": "t"}})
    server, url = serve(runner)

    res = _post(url, {"type": "prompt-run", "data": {"ast": {}}})
    first = res.readline()
    assert json.loads(first) == {"type": "text", "result": "first"}
    # Only now release the generator; the rest of the stream follows.
    server.loop_thread.loop.call_soon_threadsafe(gate["event"].set)
    rest = [json.loads(line) for line in res.read().decode().splitlines()]
    assert rest == [
        {"type": "text", "result": "second"},
        {"type": "done", "traceId": "t"},
    ]


def test_dict_chunks_are_serialized_with_trailing_newline(serve: Any) -> None:
    async def chunks() -> AsyncIterator[Any]:
        yield {"type": "object", "result": {"a": 1}}  # no newline, not a str

    runner = StubRunner({"prompt-run": {"stream": chunks()}})
    _, url = serve(runner)

    body = _post(url, {"type": "prompt-run", "data": {"ast": {}}}).read().decode()
    assert body == json.dumps({"type": "object", "result": {"a": 1}}) + "\n"


def test_value_error_maps_to_400_with_message_body(serve: Any) -> None:
    runner = StubRunner({"bogus": ValueError("Unknown event type: bogus")})
    _, url = serve(runner)

    with pytest.raises(urllib.error.HTTPError) as excinfo:
        _post(url, {"type": "bogus", "data": {}})
    assert excinfo.value.code == 400
    assert json.loads(excinfo.value.read()) == {
        "message": "Unknown event type: bogus"
    }


def test_executor_failure_maps_to_500_with_message_body(serve: Any) -> None:
    runner = StubRunner({"prompt-run": RuntimeError("provider exploded")})
    _, url = serve(runner)

    with pytest.raises(urllib.error.HTTPError) as excinfo:
        _post(url, {"type": "prompt-run", "data": {"ast": {}}})
    assert excinfo.value.code == 500
    assert json.loads(excinfo.value.read()) == {"message": "provider exploded"}


def test_invalid_json_body_maps_to_400(serve: Any) -> None:
    runner = StubRunner({})
    _, url = serve(runner)

    req = urllib.request.Request(
        url, data=b"not json", headers={"Content-Type": "application/json"}, method="POST"
    )
    with pytest.raises(urllib.error.HTTPError) as excinfo:
        urllib.request.urlopen(req, timeout=10)
    assert excinfo.value.code == 400
    body = json.loads(excinfo.value.read())
    assert body["message"].startswith("Invalid request body:")
    # Dispatch must never see a malformed event.
    assert runner.events == []


def test_health_endpoint_answers_ok(serve: Any) -> None:
    _, url = serve(StubRunner({}))
    res = urllib.request.urlopen(url + "/health", timeout=10)
    assert res.status == 200
    assert res.read() == b"ok"


def test_requests_share_one_event_loop(serve: Any) -> None:
    """User async code must see the SAME loop across requests (loop-bound SDK
    clients like httpx break otherwise)."""
    seen: list[Any] = []

    class LoopRecorder:
        async def dispatch(self, event: dict[str, Any]) -> Any:
            seen.append(asyncio.get_running_loop())
            return {"ok": True}

    _, url = serve(LoopRecorder())
    _post(url, {"type": "prompt-run", "data": {}}).read()
    _post(url, {"type": "prompt-run", "data": {}}).read()
    assert len(seen) == 2
    assert seen[0] is seen[1]


class TestParseWebhookPort:
    def test_equals_form(self) -> None:
        assert parse_webhook_port(["--webhook-port=9500"]) == 9500

    def test_space_form(self) -> None:
        assert parse_webhook_port(["--webhook-port", "9501"]) == 9501

    def test_ignores_other_flags_and_defaults(self) -> None:
        assert (
            parse_webhook_port(["--api-server-port=9418"]) == DEFAULT_WEBHOOK_PORT
        )

    def test_cli_arg_order_matches_dev_spawn(self) -> None:
        # Exactly the argv `agentmark dev` produces (dev.ts spawn args).
        argv = ["--webhook-port=9417", "--api-server-port=9418"]
        assert parse_webhook_port(argv) == 9417

    def test_non_integer_raises(self) -> None:
        with pytest.raises(ValueError, match="--webhook-port expects an integer"):
            parse_webhook_port(["--webhook-port=abc"])


# ---------------------------------------------------------------------------
# Shared HTTP wire contract (conformance-vectors/webhook-http.json)
#
# The same vector the TS dev server asserts (cli/test/runner-server-http.test.ts
# end-to-end, prompt-core/test/webhook-dispatch.test.ts at the dispatch layer),
# so the two local servers cannot drift from each other or from the managed
# servers, which already conform.
# ---------------------------------------------------------------------------

_WEBHOOK_HTTP_VECTOR = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "conformance-vectors"
        / "vectors"
        / "webhook-http.json"
    ).read_text()
)


class TestWebhookHttpVector:
    def test_stream_responses_carry_the_required_headers(self, serve: Any) -> None:
        async def chunks() -> AsyncIterator[str]:
            yield json.dumps({"type": "text", "result": "x"}) + "\n"

        runner = StubRunner({"prompt-run": {"stream": chunks(), "traceId": "t"}})
        _, url = serve(runner)

        res = _post(url, {"type": "prompt-run", "data": {"ast": {}}})

        required = _WEBHOOK_HTTP_VECTOR["streamResponse"]["requiredHeaders"]
        assert dict(
            (name, res.headers.get(name)) for name in required
        ) == required

    def test_done_event_rule_matches_the_vector(self, serve: Any) -> None:
        spec = _WEBHOOK_HTTP_VECTOR["streamResponse"]["doneEvent"]
        assert spec["appendedWhenResultHasTraceId"] is True
        assert spec["omittedWithoutTraceId"] is True

        async def chunks() -> AsyncIterator[str]:
            yield json.dumps({"type": "text", "result": "x"}) + "\n"

        runner = StubRunner({"prompt-run": {"stream": chunks(), "traceId": "t-9"}})
        _, url = serve(runner)
        lines = [
            json.loads(line)
            for line in _post(url, {"type": "prompt-run", "data": {"ast": {}}})
            .read()
            .decode()
            .splitlines()
        ]
        assert lines[-1] == {"type": "done", "traceId": "t-9"}

    def test_error_statuses_and_body_key_match_the_vector(self, serve: Any) -> None:
        statuses = _WEBHOOK_HTTP_VECTOR["errorResponse"]["statuses"]
        body_key = _WEBHOOK_HTTP_VECTOR["errorResponse"]["bodyKey"]
        runner = StubRunner(
            {
                "bogus": ValueError("Unknown event type: bogus"),
                "prompt-run": RuntimeError("provider exploded"),
            }
        )
        _, url = serve(runner)

        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _post(url, {"type": "bogus", "data": {}})
        assert excinfo.value.code == statuses["unknownJobType"]
        assert body_key in json.loads(excinfo.value.read())

        with pytest.raises(urllib.error.HTTPError) as excinfo:
            _post(url, {"type": "prompt-run", "data": {"ast": {}}})
        assert excinfo.value.code == statuses["executionFailure"]
        assert body_key in json.loads(excinfo.value.read())

        req = urllib.request.Request(
            url, data=b"not json", headers={"Content-Type": "application/json"}, method="POST"
        )
        with pytest.raises(urllib.error.HTTPError) as excinfo:
            urllib.request.urlopen(req, timeout=10)
        assert excinfo.value.code == statuses["malformedRequestBody"]

    def test_json_status_matches_the_vector(self, serve: Any) -> None:
        runner = StubRunner({"prompt-run": {"type": "text", "result": "hi"}})
        _, url = serve(runner)
        res = _post(url, {"type": "prompt-run", "data": {"ast": {}}})
        assert res.status == _WEBHOOK_HTTP_VECTOR["jsonResponse"]["status"]
