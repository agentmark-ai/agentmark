"""Loader implementations for AgentMark prompt core.

This module provides concrete implementations of the Loader protocol
for loading prompts and datasets from various sources.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .types import DatasetStream, PromptKind


def _is_relative_to(candidate: Path, base: Path) -> bool:
    """Backport of :meth:`pathlib.PurePath.is_relative_to` for Python 3.8.

    ``Path.is_relative_to`` was added in 3.9; this package targets 3.8+
    according to the repo's classifiers in places, so we provide a tiny
    helper rather than relying on the method directly. On 3.9+ the
    behaviour is identical.
    """
    try:
        candidate.relative_to(base)
        return True
    except ValueError:
        return False


class FileDatasetReader:
    """A dataset reader that reads JSONL files line by line.

    Takes an already-resolved absolute path. Path resolution and safety
    checks are performed by :class:`FileLoader` before the reader is
    constructed, so the reader trusts what it's given.
    """

    def __init__(self, file_path: str) -> None:
        """Initialize the reader.

        Args:
            file_path: Absolute path to the JSONL dataset file. Callers
                must resolve and validate the path before passing it in
                (typically via :meth:`FileLoader.load_dataset`).
        """
        self._path = file_path
        self._items: list[dict[str, Any]] = []
        self._index = 0
        self._loaded = False

    def _load(self) -> None:
        """Load and validate the dataset from file.

        Each row must be a JSON object with an ``input`` object. Parse
        and shape failures are reported with the offending line number;
        an empty dataset raises rather than yielding zero rows silently,
        so a misnamed or truncated file fails loudly instead of
        propagating into experiment runners as "the model gave a weird
        output."
        """
        if self._loaded:
            return

        path = Path(self._path)
        row_count = 0
        with open(path, encoding="utf-8") as f:
            for line_no, raw in enumerate(f, start=1):
                line = raw.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(
                        f"Failed to parse JSON at line {line_no} in dataset "
                        f"{self._path}: {exc.msg}"
                    ) from exc
                if not isinstance(row, dict) or not isinstance(row.get("input"), dict):
                    raise ValueError(
                        f"Invalid dataset row at line {line_no}: missing or "
                        "invalid 'input' field. Each row must have an "
                        "'input' object."
                    )
                self._items.append(row)
                row_count += 1

        if row_count == 0:
            raise ValueError(
                f"Dataset {self._path} is empty or contains no valid rows"
            )

        self._loaded = True

    async def read(self) -> dict[str, Any]:
        """Read the next item from the dataset."""
        self._load()

        if self._index >= len(self._items):
            return {"done": True}

        item = self._items[self._index]
        self._index += 1
        return {"done": False, "value": item}


class FileDatasetStream:
    """A dataset stream that reads from a local JSONL file.

    Wraps an already-resolved absolute path; readers are produced lazily.
    """

    def __init__(self, file_path: str) -> None:
        """Initialize the stream.

        Args:
            file_path: Absolute path to the JSONL dataset file.
        """
        self._file_path = file_path

    def get_reader(self) -> FileDatasetReader:
        """Get a reader for this stream."""
        return FileDatasetReader(self._file_path)


class FileLoader:
    """Loader that reads pre-built prompts and datasets from the filesystem.

    Use this loader for local/static mode where prompts are pre-compiled
    via ``agentmark build``. The loader is pointed at the build output
    directory; both prompts and datasets resolve relative to that
    directory.

    Example:
        loader = FileLoader("./dist/agentmark")
        prompt_ast = await loader.load("party-planner", "text")

        stream = await loader.load_dataset("party.jsonl")
        reader = stream.get_reader()
        while True:
            result = await reader.read()
            if result["done"]:
                break
            print(result["value"])
    """

    def __init__(self, build_dir: str = "./dist/agentmark") -> None:
        """Initialize the file loader.

        Args:
            build_dir: Directory containing built prompt JSON files
                (output of ``agentmark build``). Resolved against the
                current working directory if relative; defaults to
                ``"./dist/agentmark"`` so ``FileLoader()`` with no
                argument matches the conventional layout produced by
                ``agentmark build``. Both prompts and datasets resolve
                under this directory.
        """
        self._build_dir = str(Path(build_dir).resolve())

    @staticmethod
    def _normalize_template_path(template_path: str) -> str:
        """Normalize a template path to its compiled JSON path.

        Accepts the prompt name with or without an extension:
            - ``foo.prompt.json`` -> ``foo.prompt.json`` (unchanged)
            - ``foo.prompt.mdx``  -> ``foo.prompt.json``
            - ``foo.prompt``      -> ``foo.prompt.json``
            - ``foo``             -> ``foo.prompt.json``

        Args:
            template_path: User-supplied prompt path with optional extension.

        Returns:
            The corresponding ``.prompt.json`` path.
        """
        if template_path.endswith(".json"):
            return template_path
        if template_path.endswith(".mdx"):
            return template_path[: -len(".mdx")] + ".json"
        if template_path.endswith(".prompt"):
            return template_path + ".json"
        return template_path + ".prompt.json"

    def _validate_and_resolve_path(self, user_path: str) -> Path:
        """Resolve ``user_path`` against the build dir, blocking traversal.

        Rejects absolute paths and any relative path that resolves
        outside ``self._build_dir``.

        Args:
            user_path: A relative path, e.g. ``"foo.prompt.json"`` or
                ``"datasets/party.jsonl"``.

        Returns:
            Absolute, validated :class:`Path` inside the build dir.

        Raises:
            ValueError: If the path is absolute or escapes the build dir.
        """
        if os.path.isabs(user_path):
            raise ValueError("Absolute paths are not allowed")

        base = Path(self._build_dir).resolve()
        candidate = (base / user_path).resolve()

        if candidate != base and not _is_relative_to(candidate, base):
            raise ValueError("Access denied: path outside allowed directory")

        return candidate

    async def load(
        self, path: str, prompt_type: PromptKind, options: dict[str, Any] | None = None
    ) -> Any:
        """Load a pre-built prompt and return its AST.

        Reads ``<build_dir>/<normalized>.prompt.json`` (where
        ``<normalized>`` accepts the prompt name with or without
        ``.prompt.mdx`` / ``.prompt.json``), parses it, and returns the
        inner ``ast`` field — *not* the ``{ast, metadata}`` wrapper.

        Args:
            path: Prompt path. Extension is optional; ``.prompt.mdx``,
                ``.prompt.json``, and bare names are all accepted.
            prompt_type: Unused — kind is determined by the built metadata.
            options: Unused.

        Returns:
            The pre-parsed prompt AST.

        Raises:
            FileNotFoundError: If the compiled JSON is missing.
            ValueError: If the path tries to escape the build directory or
                the JSON is missing the ``ast`` field.
        """
        del prompt_type, options  # unused; retained for protocol parity
        json_path = self._normalize_template_path(path)
        safe_path = self._validate_and_resolve_path(json_path)

        if not safe_path.exists():
            raise FileNotFoundError(
                f"Pre-built prompt not found: {json_path}. "
                "Run 'agentmark build' to compile your prompts."
            )

        with open(safe_path, encoding="utf-8") as f:
            built_prompt = json.load(f)

        if not isinstance(built_prompt, dict) or "ast" not in built_prompt:
            raise ValueError(
                f"Invalid pre-built prompt at {json_path}: expected an "
                "object with an 'ast' field. Re-run 'agentmark build'."
            )

        return built_prompt["ast"]

    async def load_dataset(self, dataset_path: str) -> DatasetStream:
        """Load a dataset from a JSONL file.

        Enforces a ``.jsonl`` extension, resolves the path against the
        build directory (rejecting absolute paths and traversal), checks
        existence eagerly, and returns a stream that performs per-row
        validation on read.

        Args:
            dataset_path: Relative path to a ``.jsonl`` file under the
                build directory.

        Returns:
            A :class:`DatasetStream` for iterating over the dataset items.

        Raises:
            ValueError: If the path does not end in ``.jsonl``, is absolute,
                or escapes the build directory.
            FileNotFoundError: If the dataset file does not exist.
        """
        if not dataset_path.endswith(".jsonl"):
            raise ValueError("Dataset must be a JSON Lines file (.jsonl)")

        safe_path = self._validate_and_resolve_path(dataset_path)

        if not safe_path.exists():
            raise FileNotFoundError(
                f"Dataset not found: {dataset_path}. "
                "Ensure it was included in 'agentmark build' output."
            )

        return FileDatasetStream(str(safe_path))


__all__ = [
    "FileLoader",
    "FileDatasetStream",
    "FileDatasetReader",
]
