"""Cross-language wire-format conformance: assert the Python event→chunk
mappers agree with the pinned JSON vectors in
``@agentmark-ai/conformance-vectors``.

Mirror of ``prompt-core/test/wire-vectors.test.ts``. Both suites read the
SAME ``wire-chunks.json``, so a field rename in one runner's NDJSON (e.g.
``toolCallId`` → ``tool_call_id``) fails loudly in both CI runs instead of
surfacing as a cloud-side parse bug for one language's users.

Vector events use the TS AgentEvent field names; ``_event_from_json`` maps
them onto the Python dataclasses (``isError`` → ``is_error``, usage fields →
snake_case).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core.executor import (
    ErrorEvent,
    FinishEvent,
    ObjectDeltaEvent,
    ObjectFinalEvent,
    ReasoningDeltaEvent,
    TextDeltaEvent,
    ToolCallEvent,
    ToolResultEvent,
    UsageData,
)
from agentmark.prompt_core.webhook_runner import (
    _dataset_row_to_wire,
    _object_event_to_wire,
    _object_response_to_wire,
    _text_event_to_wire,
    _text_response_to_wire,
)


def _vectors_dir() -> Path:
    # prompt-core-python/tests/ → parents[2] = packages/ → sibling dir
    packages_dir = Path(__file__).resolve().parents[2]
    return packages_dir / "conformance-vectors" / "vectors"


def _load(name: str) -> dict[str, Any]:
    path = _vectors_dir() / f"{name}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _event_from_json(e: dict[str, Any]) -> Any:
    """Build the Python AgentEvent dataclass from the vector's TS-shaped
    event dict."""
    t = e["type"]
    if t == "text-delta":
        return TextDeltaEvent(text=e["text"])
    if t == "reasoning-delta":
        return ReasoningDeltaEvent(text=e["text"])
    if t == "tool-call":
        return ToolCallEvent(id=e["id"], name=e["name"], args=e.get("args"))
    if t == "tool-result":
        return ToolResultEvent(
            id=e["id"],
            name=e["name"],
            result=e.get("result"),
            is_error=bool(e.get("isError", False)),
        )
    if t == "finish":
        usage = None
        if (u := e.get("usage")) is not None:
            usage = UsageData(
                input_tokens=u["inputTokens"],
                output_tokens=u["outputTokens"],
                total_tokens=u.get("totalTokens"),
            )
        return FinishEvent(reason=e["reason"], usage=usage)
    if t == "error":
        return ErrorEvent(error=e["error"])
    if t == "object-delta":
        return ObjectDeltaEvent(partial=e["partial"])
    if t == "object-final":
        return ObjectFinalEvent(value=e["value"])
    raise ValueError(f"unknown vector event type: {t}")


_CASES = _load("wire-chunks")["cases"]


@pytest.mark.parametrize("case", _CASES, ids=[c["name"] for c in _CASES])
def test_wire_chunk_vector(case: dict[str, Any]) -> None:
    event = _event_from_json(case["event"])
    mapper = _text_event_to_wire if case["kind"] == "text" else _object_event_to_wire
    chunk = mapper(event)

    if case["expected"] is None:
        assert chunk is None
    else:
        assert chunk == case["expected"]


def test_vectors_cover_every_wired_event_type() -> None:
    """If a new AgentEvent variant starts emitting wire chunks, this
    inventory forces a vector case for it — the cross-language pin is the
    point. Mirrors the inventory assertion in the TS suite."""
    kinds = sorted({c["event"]["type"] for c in _CASES})
    assert kinds == sorted(
        [
            "error",
            "finish",
            "object-delta",
            "object-final",
            "reasoning-delta",
            "text-delta",
            "tool-call",
            "tool-result",
        ]
    )


_ROW_CASES = _load("dataset-rows")["cases"]


_ENVELOPE_CASES = _load("response-envelopes")["cases"]


def _usage_from_json(u: dict[str, Any] | None) -> UsageData | None:
    if u is None:
        return None
    return UsageData(
        input_tokens=u["inputTokens"],
        output_tokens=u["outputTokens"],
        total_tokens=u.get("totalTokens"),
    )


@pytest.mark.parametrize(
    "case", _ENVELOPE_CASES, ids=[c["name"] for c in _ENVELOPE_CASES]
)
def test_response_envelope_vector(case: dict[str, Any]) -> None:
    """Non-streaming envelope assembly agrees with the shared golden cases.

    Pins the omission semantics (Python historically emitted
    ``"usage": null`` where TS omitted; TS historically emitted
    ``"traceId": ""`` where Python omitted) and the WireUsage alias
    expansion from canonical AgentUsage args.
    """
    args = case["args"]
    usage = _usage_from_json(args.get("usage"))
    if case["kind"] == "text":
        envelope = _text_response_to_wire(
            result=args.get("result", ""),
            usage=usage,
            finish_reason=args.get("finishReason"),
            tool_calls=args.get("toolCalls") or [],
            tool_results=args.get("toolResults") or [],
            trace_id=args.get("traceId"),
        )
    else:
        envelope = _object_response_to_wire(
            result=args.get("result"),
            usage=usage,
            finish_reason=args.get("finishReason"),
            trace_id=args.get("traceId"),
        )
    assert envelope == case["expected"]


@pytest.mark.parametrize("case", _ROW_CASES, ids=[c["name"] for c in _ROW_CASES])
def test_dataset_row_vector(case: dict[str, Any]) -> None:
    """Experiment-row chunk assembly agrees with the shared golden cases.

    Vector args use the TS field names; absent keys map to ``None`` kwargs,
    exercising the omission semantics the vector pins (Python historically
    emitted ``"expectedOutput": null`` where TS omitted the key).
    """
    args = case["args"]
    chunk = _dataset_row_to_wire(
        input_data=args.get("input"),
        expected_output=args.get("expectedOutput"),
        actual_output=args.get("actualOutput"),
        tokens=args.get("tokens"),
        evals=args.get("evals") or [],
        trace_id=args.get("traceId"),
        run_id=args["runId"],
        run_name=args["runName"],
    )
    assert chunk == case["expected"]
