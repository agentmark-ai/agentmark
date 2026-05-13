"""Tests for ``FileLoader`` — the on-disk pre-built prompt + dataset reader."""

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
    base_dir: Path,
    relative_path: str,
    ast: Any,
    kind: str = "text",
    name: str = "test-prompt",
) -> Path:
    """Write a ``{ast, metadata}`` JSON envelope at ``base_dir/relative_path``."""
    target = base_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(
            {
                "ast": ast,
                "metadata": {
                    "path": relative_path,
                    "kind": kind,
                    "name": name,
                    "builtAt": "2026-05-08T00:00:00.000Z",
                },
            }
        ),
        encoding="utf-8",
    )
    return target


def _write_dataset(base_dir: Path, relative_path: str, rows: list[Any]) -> None:
    """Write JSONL rows at ``base_dir/relative_path``."""
    target = base_dir / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        "\n".join(json.dumps(r) for r in rows), encoding="utf-8"
    )


async def _collect(stream: Any) -> list[Any]:
    """Drain a dataset stream into a list."""
    reader = stream.get_reader()
    out: list[Any] = []
    while True:
        result = await reader.read()
        if result["done"]:
            return out
        out.append(result["value"])


# ---------------------------------------------------------------------------
# FileLoader.load
# ---------------------------------------------------------------------------


class TestFileLoaderLoad:
    @pytest.mark.asyncio
    async def test_loads_a_pre_built_prompt_by_name_without_extension(
        self, tmp_path: Path
    ) -> None:
        _write_built_prompt(tmp_path, "party-planner.prompt.json", {"type": "root"})
        loader = FileLoader(str(tmp_path))

        ast = await loader.load("party-planner", "text")

        assert ast == {"type": "root"}

    @pytest.mark.asyncio
    async def test_loads_with_the_prompt_mdx_extension_form(
        self, tmp_path: Path
    ) -> None:
        _write_built_prompt(
            tmp_path,
            "party-planner.prompt.json",
            {"type": "root", "marker": "mdx"},
        )
        loader = FileLoader(str(tmp_path))

        ast = await loader.load("party-planner.prompt.mdx", "text")

        assert ast == {"type": "root", "marker": "mdx"}

    @pytest.mark.asyncio
    async def test_loads_a_nested_prompt_under_a_subdirectory(
        self, tmp_path: Path
    ) -> None:
        _write_built_prompt(
            tmp_path,
            "agents/customer-support.prompt.json",
            {"type": "root", "marker": "nested"},
        )
        loader = FileLoader(str(tmp_path))

        ast = await loader.load("agents/customer-support", "text")

        assert ast == {"type": "root", "marker": "nested"}

    @pytest.mark.asyncio
    async def test_throws_a_clear_error_when_the_prompt_is_not_found(
        self, tmp_path: Path
    ) -> None:
        loader = FileLoader(str(tmp_path))

        with pytest.raises(FileNotFoundError, match="Pre-built prompt not found"):
            await loader.load("does-not-exist", "text")

    @pytest.mark.asyncio
    async def test_rejects_absolute_paths(self, tmp_path: Path) -> None:
        loader = FileLoader(str(tmp_path))

        with pytest.raises(ValueError, match="Absolute paths are not allowed"):
            await loader.load("/etc/passwd", "text")

    @pytest.mark.asyncio
    async def test_blocks_path_traversal_attempts(self, tmp_path: Path) -> None:
        loader = FileLoader(str(tmp_path))
        # Place a sibling outside the build dir.
        (tmp_path.parent / "outside.prompt.json").write_text(
            json.dumps({"ast": {"secret": True}}), encoding="utf-8"
        )

        with pytest.raises(ValueError, match="path outside allowed directory"):
            await loader.load("../outside", "text")


# ---------------------------------------------------------------------------
# Default build_dir: ``FileLoader()`` with no args defaults to
# ``"./dist/agentmark"``, matching the conventional layout produced by
# ``agentmark build``. The default is sugar; the explicit form must produce
# the same resolution so user code that "graduates" from `FileLoader()` to
# `FileLoader("./dist/agentmark")` doesn't shift behavior.
# ---------------------------------------------------------------------------


class TestFileLoaderDefaultBuildDir:
    @pytest.mark.asyncio
    async def test_default_resolves_identically_to_explicit_form(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Anchor cwd so the relative default resolves predictably.
        monkeypatch.chdir(tmp_path)

        defaulted = FileLoader()
        explicit = FileLoader("./dist/agentmark")

        assert defaulted._build_dir == explicit._build_dir
        assert defaulted._build_dir == str((tmp_path / "dist" / "agentmark").resolve())

    @pytest.mark.asyncio
    async def test_default_loads_prompts_from_conventional_layout(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        # Place a built prompt at the conventional location and call
        # ``FileLoader()`` with no args — should Just Work from a project root.
        _write_built_prompt(
            tmp_path / "dist" / "agentmark",
            "party-planner.prompt.json",
            {"type": "root"},
        )
        monkeypatch.chdir(tmp_path)

        loader = FileLoader()

        ast = await loader.load("party-planner", "text")

        assert ast == {"type": "root"}


# ---------------------------------------------------------------------------
# Path normalization — guards all four ``_normalize_template_path`` branches
# (``.json``, ``.mdx``, ``.prompt``, bare name).
# ---------------------------------------------------------------------------


class TestFileLoaderLoadPathNormalization:
    @pytest.mark.asyncio
    async def test_loads_with_explicit_prompt_json_extension(
        self, tmp_path: Path
    ) -> None:
        _write_built_prompt(tmp_path, "party-planner.prompt.json", {"type": "root"})
        loader = FileLoader(str(tmp_path))

        ast = await loader.load("party-planner.prompt.json", "text")

        assert ast == {"type": "root"}

    @pytest.mark.asyncio
    async def test_loads_with_prompt_only_suffix(self, tmp_path: Path) -> None:
        _write_built_prompt(tmp_path, "party-planner.prompt.json", {"type": "root"})
        loader = FileLoader(str(tmp_path))

        ast = await loader.load("party-planner.prompt", "text")

        assert ast == {"type": "root"}


# ---------------------------------------------------------------------------
# ``{ast, metadata}`` unwrap — regression guard. A prior implementation
# returned the whole wrapper; this pin keeps the inner ``ast`` field as the
# return value.
# ---------------------------------------------------------------------------


class TestFileLoaderLoadUnwrap:
    @pytest.mark.asyncio
    async def test_returns_ast_field_not_wrapper(self, tmp_path: Path) -> None:
        ast = {"type": "root", "children": [{"type": "text", "value": "hi"}]}
        _write_built_prompt(tmp_path, "p.prompt.json", ast)
        loader = FileLoader(str(tmp_path))

        result = await loader.load("p", "text")

        assert result == ast
        assert "metadata" not in result

    @pytest.mark.asyncio
    async def test_rejects_json_missing_ast_field(self, tmp_path: Path) -> None:
        (tmp_path / "broken.prompt.json").write_text(
            json.dumps({"type": "root", "children": []}), encoding="utf-8"
        )
        loader = FileLoader(str(tmp_path))

        with pytest.raises(ValueError, match="expected an object with an 'ast' field"):
            await loader.load("broken", "text")


# ---------------------------------------------------------------------------
# FileLoader.load_dataset
# ---------------------------------------------------------------------------


class TestFileLoaderLoadDataset:
    @pytest.mark.asyncio
    async def test_loads_a_dataset_at_the_path_relative_to_base_path(
        self, tmp_path: Path
    ) -> None:
        _write_dataset(
            tmp_path,
            "data.jsonl",
            [
                {"input": {"x": 1}, "expected_output": "one"},
                {"input": {"x": 2}, "expected_output": "two"},
            ],
        )
        loader = FileLoader(str(tmp_path))

        rows = await _collect(await loader.load_dataset("data.jsonl"))

        assert len(rows) == 2
        assert rows[0]["input"] == {"x": 1}

    @pytest.mark.asyncio
    async def test_preserves_subdirectory_structure_under_base_path(
        self, tmp_path: Path
    ) -> None:
        _write_dataset(
            tmp_path, "fixtures/cases.jsonl", [{"input": {"case": "a"}}]
        )
        loader = FileLoader(str(tmp_path))

        rows = await _collect(await loader.load_dataset("fixtures/cases.jsonl"))

        assert len(rows) == 1
        assert rows[0]["input"] == {"case": "a"}

    @pytest.mark.asyncio
    async def test_rejects_datasets_that_are_not_jsonl(self, tmp_path: Path) -> None:
        loader = FileLoader(str(tmp_path))

        with pytest.raises(ValueError, match="JSON Lines file"):
            await loader.load_dataset("data.csv")

    @pytest.mark.asyncio
    async def test_throws_a_clear_error_when_the_dataset_file_is_missing(
        self, tmp_path: Path
    ) -> None:
        loader = FileLoader(str(tmp_path))

        # Eager — surfaces from ``load_dataset`` itself, not on first read.
        # Keeping this loud means scaffolding mistakes (wrong filename in
        # frontmatter, forgotten ``agentmark build``) fail at the call site.
        with pytest.raises(FileNotFoundError, match="Dataset not found"):
            await loader.load_dataset("missing.jsonl")

    @pytest.mark.asyncio
    async def test_rejects_path_traversal_in_dataset_paths(
        self, tmp_path: Path
    ) -> None:
        loader = FileLoader(str(tmp_path))

        with pytest.raises(ValueError, match="path outside allowed directory"):
            await loader.load_dataset("../outside.jsonl")

    @pytest.mark.asyncio
    async def test_errors_on_jsonl_rows_missing_an_input_field(
        self, tmp_path: Path
    ) -> None:
        # Schema regression guard: rows must conform to
        # ``{ input: object, expected_output?: string }``. Without this
        # validation a malformed row would silently flow into experiment
        # runners and produce confusing downstream failures.
        _write_dataset(tmp_path, "bad.jsonl", [{"wrong_key": 1}])
        loader = FileLoader(str(tmp_path))

        stream = await loader.load_dataset("bad.jsonl")

        with pytest.raises(ValueError, match="missing or invalid 'input'"):
            await _collect(stream)
