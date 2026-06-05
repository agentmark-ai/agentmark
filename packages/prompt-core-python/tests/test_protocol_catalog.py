"""Cross-language protocol-type pinning — Python side.

Mirror of ``prompt-core/test/protocol-catalog.test.ts``: assert the REAL
AgentEvent dataclass union agrees with the normative catalog in
``conformance-vectors/protocol-catalog.json``.

Exhaustiveness is reflected from the implementation, not hand-listed:
``typing.get_args(AgentEvent)`` flattens the union to the actual dataclass
members, so a variant added to the Python union without a catalog entry (or
vice versa) fails here — and the TS suite enforces the same from its union,
making the catalog the single normative bridge.
"""

from __future__ import annotations

import dataclasses
import json
from pathlib import Path
from typing import Any, get_args

import pytest

from agentmark.prompt_core.executor import (
    AgentEvent,
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


def _vectors_dir() -> Path:
    packages_dir = Path(__file__).resolve().parents[2]
    return packages_dir / "conformance-vectors" / "vectors"


CATALOG = json.loads(
    (_vectors_dir() / "protocol-catalog.json").read_text(encoding="utf-8")
)

# Reflect the union members from the REAL type (nested unions flatten).
UNION_MEMBERS = set(get_args(AgentEvent))

# Python field name -> wire/catalog field name (the dataclasses use
# snake_case for is_error only; ids/names match).
_FIELD_NAME_MAP = {"is_error": "isError"}


def _variant_type(cls: type) -> str:
    """The `type` literal default each event dataclass carries."""
    for f in dataclasses.fields(cls):
        if f.name == "type":
            return f.default  # type: ignore[return-value]
    raise AssertionError(f"{cls.__name__} has no type field")


SAMPLES: dict[str, Any] = {
    "text-delta": TextDeltaEvent(text="hi"),
    "reasoning-delta": ReasoningDeltaEvent(text="hmm"),
    "tool-call": ToolCallEvent(id="t1", name="search", args={"q": 1}),
    "tool-result": ToolResultEvent(
        id="t1", name="search", result="hit", is_error=False
    ),
    "object-delta": ObjectDeltaEvent(partial={"a": 1}),
    "object-final": ObjectFinalEvent(value={"a": 1}),
    "finish": FinishEvent(
        reason="stop", usage=UsageData(input_tokens=1, output_tokens=2, total_tokens=3)
    ),
    "error": ErrorEvent(error="boom"),
}

_KIND_CHECKS = {
    "string": lambda v: isinstance(v, str),
    "number": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
    "boolean": lambda v: isinstance(v, bool),
    "any": lambda v: True,
}


def _usage_to_fields(u: UsageData) -> dict[str, Any]:
    out: dict[str, Any] = {
        "inputTokens": u.input_tokens,
        "outputTokens": u.output_tokens,
    }
    if u.total_tokens is not None:
        out["totalTokens"] = u.total_tokens
    return out


def _event_to_fields(ev: Any) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for f in dataclasses.fields(ev):
        if f.name == "type":
            continue
        value = getattr(ev, f.name)
        name = _FIELD_NAME_MAP.get(f.name, f.name)
        if isinstance(value, UsageData):
            value = _usage_to_fields(value)
        out[name] = value
    return out


def _fields_ok(
    obj: dict[str, Any],
    required: dict[str, str],
    optional: dict[str, str],
) -> bool:
    usage_spec = CATALOG["agentUsage"]
    for field, kind in required.items():
        if field not in obj:
            return False
        if not _kind_ok(obj[field], kind, usage_spec):
            return False
    for field, kind in optional.items():
        if field in obj and obj[field] is not None:
            if not _kind_ok(obj[field], kind, usage_spec):
                return False
    return True


def _kind_ok(value: Any, kind: str, usage_spec: dict[str, Any]) -> bool:
    if kind == "usage":
        if not isinstance(value, dict):
            return False
        return _fields_ok(value, usage_spec["required"], usage_spec["optional"])
    return _KIND_CHECKS[kind](value)


def test_union_inventory_matches_catalog() -> None:
    """The REAL dataclass union and the catalog list identical variants."""
    union_types = sorted(_variant_type(cls) for cls in UNION_MEMBERS)
    assert union_types == sorted(CATALOG["agentEvents"].keys())
    # And the sample table covers the union (no stale/missing samples).
    assert sorted(SAMPLES.keys()) == union_types


@pytest.mark.parametrize("variant", sorted(SAMPLES.keys()))
def test_event_sample_satisfies_catalog(variant: str) -> None:
    spec = CATALOG["agentEvents"][variant]
    fields = _event_to_fields(SAMPLES[variant])
    assert _fields_ok(fields, spec["required"], spec["optional"]), (
        f"sample for '{variant}' violates the catalog: {fields}"
    )


def test_wire_chunk_builders_satisfy_catalog() -> None:
    """The runner's own builders emit chunks the catalog describes."""
    from agentmark.prompt_core.webhook_runner import (
        _dataset_row_to_wire,
        _object_event_to_wire,
        _text_event_to_wire,
    )

    produced: dict[str, dict[str, Any] | None] = {
        "text-result": _text_event_to_wire(TextDeltaEvent(text="hi")),
        "text-toolCall": _text_event_to_wire(
            ToolCallEvent(id="t", name="s", args={})
        ),
        "text-toolResult": _text_event_to_wire(
            ToolResultEvent(id="t", name="s", result=1)
        ),
        "text-finish": _text_event_to_wire(
            FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2))
        ),
        "object-result": _object_event_to_wire(ObjectDeltaEvent(partial={"a": 1})),
        "object-usage": _object_event_to_wire(
            FinishEvent(reason="stop", usage=UsageData(input_tokens=1, output_tokens=2))
        ),
        "dataset-row": _dataset_row_to_wire(
            input_data={},
            expected_output="x",
            actual_output="x",
            tokens=None,
            evals=[],
            trace_id="abc",
            run_id="r",
            run_name="n",
        ),
        "error": _text_event_to_wire(ErrorEvent(error="boom")),
    }

    for name, chunk in produced.items():
        assert chunk is not None, name
        spec = CATALOG["wireChunks"][name]
        for k, v in spec.get("discriminant", {}).items():
            assert chunk[k] == v, f"{name}: discriminant {k}"
        assert _fields_ok(chunk, spec["required"], spec["optional"]), (
            f"builder output for '{name}' violates the catalog: {chunk}"
        )
