"""Cross-language conformance for AgentMark trace-grouping attributes.

Drives the shared golden vectors in
``conformance-vectors/vectors/grouping-attributes.json`` through
:func:`to_agentmark_attributes` and asserts the Python mapping byte-matches the
contract that ``@agentmark-ai/otel`` (TypeScript) is also held to. If this fails,
Python and TypeScript trace grouping have diverged.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark_sdk import to_agentmark_attributes

# tests/ -> sdk-python/ -> packages/ -> conformance-vectors/vectors/...
_VECTORS_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "conformance-vectors"
    / "vectors"
    / "grouping-attributes.json"
)

# Map the contract's camelCase input keys onto this SDK's snake_case kwargs.
_KEY_MAP = {
    "sessionId": "session_id",
    "sessionName": "session_name",
    "userId": "user_id",
    "traceName": "trace_name",
    "tags": "tags",
    "metadata": "metadata",
}


def _load_cases() -> list[dict[str, Any]]:
    data = json.loads(_VECTORS_PATH.read_text(encoding="utf-8"))
    cases: list[dict[str, Any]] = data["cases"]
    return cases


_CASES = _load_cases()


def test_vectors_file_is_present_and_nonempty() -> None:
    """Guard: a silently-missing vectors file must fail loudly, not vacuously
    pass a zero-case parametrization."""
    assert _VECTORS_PATH.is_file(), f"missing vectors file: {_VECTORS_PATH}"
    assert len(_CASES) >= 5


@pytest.mark.parametrize("case", _CASES, ids=[c["name"] for c in _CASES])
def test_to_agentmark_attributes_matches_vector(case: dict[str, Any]) -> None:
    """Each vector's input (camelCase) maps to exactly its expected output."""
    snake_input = {_KEY_MAP[k]: v for k, v in case["input"].items()}

    result = to_agentmark_attributes(**snake_input)

    assert result == case["expected"]
