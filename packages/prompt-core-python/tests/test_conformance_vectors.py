"""Cross-language conformance: assert every Python primitive agrees with
the pinned JSON vectors in ``@agentmark-ai/conformance-vectors``.

Mirror of ``prompt-core/test/conformance-vectors.test.ts``. Both suites
read the SAME JSON files, so any drift fails loudly in both CI runs.

The vectors package is workspace-only (``private: true``), so we resolve
its path through the monorepo rather than a published npm/pip dep.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core.executor_helpers import finalize_usage, normalize_error
from agentmark.prompt_core.webhook_runner import _compute_dataset_item_name


def _vectors_dir() -> Path:
    # prompt-core-python/tests/ → parents[2] = packages/ → sibling dir
    packages_dir = Path(__file__).resolve().parents[2]
    return packages_dir / "conformance-vectors" / "vectors"


def _load(name: str) -> dict[str, Any]:
    path = _vectors_dir() / f"{name}.json"
    # Explicit UTF-8: Path.open() defaults to the locale codepage (cp1252 on
    # Windows CI), which mis-decodes the unicode dataset-item-name vectors and
    # produces a different hash than the shared cross-language vectors expect.
    with path.open(encoding="utf-8") as fp:
        return json.load(fp)


def _dataset_item_cases() -> list[tuple[str, Any, int, str]]:
    data = _load("dataset-item-name")
    return [(c["name"], c["input"], c["index"], c["expected"]) for c in data["cases"]]


@pytest.mark.parametrize("name,value,index,expected", _dataset_item_cases())
def test_dataset_item_name_vector(name: str, value: Any, index: int, expected: str) -> None:
    del name  # pytest parametrize id
    assert _compute_dataset_item_name(value, index) == expected


def _finalize_usage_cases() -> list[tuple[str, dict[str, Any], dict[str, int] | None]]:
    data = _load("finalize-usage")
    return [(c["name"], c["input"], c["expected"]) for c in data["cases"]]


@pytest.mark.parametrize("name,input_,expected", _finalize_usage_cases())
def test_finalize_usage_vector(
    name: str, input_: dict[str, Any], expected: dict[str, int] | None
) -> None:
    del name
    got = finalize_usage(
        input_tokens=input_.get("inputTokens") or 0,
        output_tokens=input_.get("outputTokens") or 0,
        total_tokens=input_.get("totalTokens"),
    )
    if expected is None:
        # Adapters normalize to numbers before calling; when all three are
        # null the Python helper gets (0, 0, None) and derives {0,0,0}.
        assert got is not None
        assert got.input_tokens == 0
        assert got.output_tokens == 0
        assert got.total_tokens == 0
        return
    assert got is not None
    assert got.input_tokens == expected["inputTokens"]
    assert got.output_tokens == expected["outputTokens"]
    assert got.total_tokens == expected["totalTokens"]


def test_finalize_usage_returns_none_for_all_none() -> None:
    assert finalize_usage(None, None, None) is None


def _normalize_error_cases() -> list[tuple[str, Any, str]]:
    data = _load("normalize-error")
    return [(c["name"], c["input"], c["expected"]) for c in data["cases"]]


@pytest.mark.parametrize("name,input_,expected", _normalize_error_cases())
def test_normalize_error_vector(name: str, input_: Any, expected: str) -> None:
    del name
    assert normalize_error(input_) == expected
