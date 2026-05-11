"""Tests for ``FileLoader.load`` — the on-disk pre-built prompt reader.

These tests pin the contract that mirrors ``packages/loader-file`` (TS):

    - Path normalization: ``foo``, ``foo.prompt.mdx``, ``foo.prompt`` all
      resolve to ``foo.prompt.json`` on disk.
    - Build-output convention: prompts live under
      ``<base_dir>/dist/agentmark/`` (not ``<base_dir>`` directly).
    - AST extraction: returns the inner ``ast`` field, *not* the
      ``{ast, metadata}`` wrapper. This is the bug that motivated the
      implementation — the prior stub forced every scaffolded ``main.py``
      to do the unwrap manually.
    - Path traversal is rejected (absolute paths and ``../`` escapes).
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from agentmark.prompt_core import FileLoader

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_built_prompt(
    project_root: Path,
    name: str,
    ast: dict[str, Any],
    metadata: dict[str, Any] | None = None,
) -> Path:
    """Write a ``{ast, metadata}`` JSON file at the build-output convention.

    Mirrors the on-disk shape produced by ``agentmark build``: a wrapper
    dict at ``<project_root>/dist/agentmark/<name>.prompt.json``.
    """
    build_dir = project_root / "dist" / "agentmark"
    build_dir.mkdir(parents=True, exist_ok=True)
    target = build_dir / f"{name}.prompt.json"
    target.write_text(
        json.dumps(
            {
                "ast": ast,
                "metadata": metadata
                or {
                    "path": f"prompts/{name}.prompt.mdx",
                    "kind": "text",
                    "name": name,
                    "builtAt": "2026-05-08T00:00:00.000Z",
                },
            }
        ),
        encoding="utf-8",
    )
    return target


SAMPLE_AST: dict[str, Any] = {
    "type": "root",
    "children": [{"type": "text", "value": "hello"}],
}


# ---------------------------------------------------------------------------
# Path normalization
# ---------------------------------------------------------------------------


class TestLoadAcceptsMultiplePathForms:
    """``FileLoader.load`` must accept the same path forms as the TS loader."""

    @pytest.mark.asyncio
    async def test_loads_with_no_extension(self, tmp_path: Path) -> None:
        _write_built_prompt(tmp_path, "party-planner", SAMPLE_AST)
        loader = FileLoader(base_dir=str(tmp_path))

        ast = await loader.load("party-planner", "text")

        assert ast == SAMPLE_AST

    @pytest.mark.asyncio
    async def test_loads_with_prompt_mdx_extension(self, tmp_path: Path) -> None:
        _write_built_prompt(tmp_path, "party-planner", SAMPLE_AST)
        loader = FileLoader(base_dir=str(tmp_path))

        ast = await loader.load("party-planner.prompt.mdx", "text")

        assert ast == SAMPLE_AST

    @pytest.mark.asyncio
    async def test_loads_with_prompt_json_extension(self, tmp_path: Path) -> None:
        _write_built_prompt(tmp_path, "party-planner", SAMPLE_AST)
        loader = FileLoader(base_dir=str(tmp_path))

        ast = await loader.load("party-planner.prompt.json", "text")

        assert ast == SAMPLE_AST

    @pytest.mark.asyncio
    async def test_loads_with_prompt_only_suffix(self, tmp_path: Path) -> None:
        # The TS loader appends `.json` when the name ends in `.prompt`.
        _write_built_prompt(tmp_path, "party-planner", SAMPLE_AST)
        loader = FileLoader(base_dir=str(tmp_path))

        ast = await loader.load("party-planner.prompt", "text")

        assert ast == SAMPLE_AST


# ---------------------------------------------------------------------------
# AST extraction (the actual bug)
# ---------------------------------------------------------------------------


class TestLoadReturnsInnerAst:
    """Returns the inner ``ast`` field, not the ``{ast, metadata}`` wrapper."""

    @pytest.mark.asyncio
    async def test_returns_ast_value_not_wrapper(self, tmp_path: Path) -> None:
        _write_built_prompt(tmp_path, "party-planner", SAMPLE_AST)
        loader = FileLoader(base_dir=str(tmp_path))

        result = await loader.load("party-planner", "text")

        assert result == SAMPLE_AST
        # Wrapper keys must not leak through.
        assert isinstance(result, dict)
        assert "metadata" not in result
        # The top-level "ast" key from the wrapper would only appear in
        # error/regression paths — assert it isn't there as the *outer*
        # key (the inner AST may have its own `ast` field elsewhere; we
        # check shape, not literal absence).
        assert set(result.keys()) == {"type", "children"}

    @pytest.mark.asyncio
    async def test_rejects_json_missing_ast_field(self, tmp_path: Path) -> None:
        # Simulate a malformed/legacy build where the wrapper isn't there
        # (e.g., someone hand-wrote the JSON or an old build was kept).
        # The loader must surface a clear error, not silently return junk.
        build_dir = tmp_path / "dist" / "agentmark"
        build_dir.mkdir(parents=True)
        (build_dir / "broken.prompt.json").write_text(
            json.dumps({"type": "root", "children": []}), encoding="utf-8"
        )
        loader = FileLoader(base_dir=str(tmp_path))

        with pytest.raises(ValueError, match="expected an object with an 'ast' field"):
            await loader.load("broken", "text")


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class TestLoadFileNotFound:
    @pytest.mark.asyncio
    async def test_raises_with_actionable_message_when_missing(
        self, tmp_path: Path
    ) -> None:
        # No `dist/agentmark/...` written.
        loader = FileLoader(base_dir=str(tmp_path))

        with pytest.raises(FileNotFoundError) as exc_info:
            await loader.load("missing", "text")

        # The TS error string is the contract — match on the substring
        # so the user sees the exact recovery hint they'd see in TS.
        assert "Pre-built prompt not found" in str(exc_info.value)
        assert "agentmark build" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Path traversal safety
# ---------------------------------------------------------------------------


class TestLoadRejectsPathTraversal:
    @pytest.mark.asyncio
    async def test_rejects_absolute_path(self, tmp_path: Path) -> None:
        # Even if a file exists at the absolute target, the loader must
        # reject the input on principle (TS parity).
        secret = tmp_path / "secret.json"
        secret.write_text(json.dumps({"ast": SAMPLE_AST}), encoding="utf-8")
        loader = FileLoader(base_dir=str(tmp_path))

        with pytest.raises(ValueError, match="Absolute paths are not allowed"):
            await loader.load(str(secret), "text")

    @pytest.mark.asyncio
    async def test_rejects_dotdot_escape(self, tmp_path: Path) -> None:
        # Place a file *outside* the build dir but inside `base_dir` and
        # try to climb to it from inside dist/agentmark/.
        outside = tmp_path / "outside.prompt.json"
        outside.write_text(
            json.dumps({"ast": SAMPLE_AST, "metadata": {}}), encoding="utf-8"
        )
        loader = FileLoader(base_dir=str(tmp_path))

        with pytest.raises(ValueError, match="path outside allowed directory"):
            await loader.load("../../outside.prompt.json", "text")

    @pytest.mark.asyncio
    async def test_rejects_dotdot_to_sibling_dir(self, tmp_path: Path) -> None:
        # `dist/agentmark/` is the boundary — escaping to a sibling under
        # `dist/` (e.g. `dist/secrets/`) must be blocked.
        (tmp_path / "dist" / "secrets").mkdir(parents=True)
        (tmp_path / "dist" / "secrets" / "leak.prompt.json").write_text(
            json.dumps({"ast": SAMPLE_AST, "metadata": {}}), encoding="utf-8"
        )
        loader = FileLoader(base_dir=str(tmp_path))

        with pytest.raises(ValueError, match="path outside allowed directory"):
            await loader.load("../secrets/leak.prompt.json", "text")


# ---------------------------------------------------------------------------
# Dataset loading — straight base-dir resolution
#
# ``load_dataset`` takes the supplied path at face value: joined against
# ``base_dir`` if it's relative, used verbatim if it's absolute. No
# automatic prefix stripping, no fallback probing — callers control the
# base path via the ``FileLoader(base_dir=...)`` constructor. A
# mismatched path fails loudly rather than silently resolving to a
# different file, matching the api-server's ``/v1/templates`` handler
# semantics.
# ---------------------------------------------------------------------------


def _write_dataset(target: Path, rows: list[dict[str, Any]]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "\n".join(json.dumps(row) for row in rows), encoding="utf-8"
    )


async def _collect_dataset(stream: Any) -> list[dict[str, Any]]:
    reader = stream.get_reader()
    items: list[dict[str, Any]] = []
    while True:
        result = await reader.read()
        if result["done"]:
            return items
        items.append(result["value"])


SAMPLE_ROWS: list[dict[str, Any]] = [
    {"input": {"x": 1}, "expected_output": "one"},
    {"input": {"x": 2}, "expected_output": "two"},
]


class TestLoadDatasetResolution:
    """``load_dataset`` resolves paths relative to ``base_dir`` only."""

    @pytest.mark.asyncio
    async def test_loads_dataset_relative_to_base_dir(self, tmp_path: Path) -> None:
        # base_dir = project root; frontmatter form is
        # ``agentmark/datasets/x.jsonl`` (relative-to-base form).
        _write_dataset(tmp_path / "agentmark" / "data.jsonl", SAMPLE_ROWS)
        loader = FileLoader(base_dir=str(tmp_path))

        rows = await _collect_dataset(
            await loader.load_dataset("agentmark/data.jsonl")
        )

        assert rows == SAMPLE_ROWS

    @pytest.mark.asyncio
    async def test_loads_nested_dataset(self, tmp_path: Path) -> None:
        _write_dataset(
            tmp_path / "agentmark" / "fixtures" / "cases.jsonl",
            [{"input": {"case": "a"}}],
        )
        loader = FileLoader(base_dir=str(tmp_path))

        rows = await _collect_dataset(
            await loader.load_dataset("agentmark/fixtures/cases.jsonl")
        )

        assert rows == [{"input": {"case": "a"}}]


class TestLoadDatasetAbsolutePath:
    """Absolute paths bypass ``base_dir`` and are used verbatim."""

    @pytest.mark.asyncio
    async def test_absolute_path_used_verbatim(self, tmp_path: Path) -> None:
        target = tmp_path / "explicit.jsonl"
        _write_dataset(target, SAMPLE_ROWS)
        loader = FileLoader(base_dir=str(tmp_path / "other"))

        # Pinning the absolute-path bypass: ops use-cases that
        # legitimately need to point at a file outside `base_dir` must
        # continue to work.
        rows = await _collect_dataset(await loader.load_dataset(str(target)))

        assert rows == SAMPLE_ROWS


class TestLoadDatasetMissing:
    """Missing dataset surfaces a clear FileNotFoundError."""

    @pytest.mark.asyncio
    async def test_raises_when_path_does_not_exist(
        self, tmp_path: Path
    ) -> None:
        loader = FileLoader(base_dir=str(tmp_path))

        stream = await loader.load_dataset("missing.jsonl")
        # File access is lazy in the Python reader; the error surfaces
        # on first `read()`. Pin this so future eager-existence changes
        # are a conscious decision rather than accidental.
        with pytest.raises(FileNotFoundError):
            await _collect_dataset(stream)

