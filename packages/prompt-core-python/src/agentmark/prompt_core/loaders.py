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
    """A dataset reader that reads JSONL files line by line."""

    def __init__(self, file_path: str, base_dir: str | None = None) -> None:
        """Initialize the reader.

        Args:
            file_path: Path to the JSONL dataset file. Resolved relative
                to ``base_dir`` if not absolute. Callers control the
                base path via the ``FileLoader(base_dir=...)``
                constructor; no automatic prefix stripping or fallback
                probing happens here.
            base_dir: Optional base directory for resolving relative paths.
        """
        if base_dir and not os.path.isabs(file_path):
            self._path = os.path.join(base_dir, file_path)
        else:
            self._path = file_path

        self._items: list[dict[str, Any]] = []
        self._index = 0
        self._loaded = False

    def _load(self) -> None:
        """Load the dataset from file."""
        if self._loaded:
            return

        path = Path(self._path)
        if not path.exists():
            raise FileNotFoundError(f"Dataset file not found: {self._path}")

        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    self._items.append(json.loads(line))

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
    """A dataset stream that reads from a local JSONL file."""

    def __init__(self, file_path: str, base_dir: str | None = None) -> None:
        """Initialize the stream.

        Args:
            file_path: Path to the JSONL dataset file.
            base_dir: Optional base directory for resolving relative paths.
        """
        self._file_path = file_path
        self._base_dir = base_dir

    def get_reader(self) -> FileDatasetReader:
        """Get a reader for this stream."""
        return FileDatasetReader(self._file_path, self._base_dir)


class FileLoader:
    """Loader that reads prompts and datasets from the local filesystem.

    This loader implements the Loader protocol for local development,
    reading dataset files from disk.

    Example:
        loader = FileLoader(base_dir="/path/to/project")
        dataset = await loader.load_dataset("data/my-dataset.jsonl")

        reader = dataset.get_reader()
        while True:
            result = await reader.read()
            if result["done"]:
                break
            print(result["value"])
    """

    def __init__(self, base_dir: str | None = None) -> None:
        """Initialize the file loader.

        Args:
            base_dir: Base directory for resolving relative paths.
                If None, uses the current working directory.
        """
        self._base_dir = base_dir or os.getcwd()

    @staticmethod
    def _normalize_template_path(template_path: str) -> str:
        """Normalize a template path to its compiled JSON path.

        Mirrors the TS ``normalizeTemplatePath`` in ``loader-file``:
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
        """Resolve ``user_path`` against the build-output dir, blocking traversal.

        Mirrors the TS ``validateAndResolvePath`` (loader-file): rejects
        absolute paths and any relative path that resolves outside the
        ``<base_dir>/dist/agentmark/`` directory.

        Note on the API gap with TS: the TS ``FileLoader`` takes the build
        output directory directly (``new FileLoader('./dist/agentmark')``),
        while the Python ``FileLoader`` takes the project root as
        ``base_dir`` and appends ``dist/agentmark/`` internally. We preserve
        this here for backward compatibility with existing scaffolded
        ``agentmark_client.py`` files (and ``load_dataset`` callers).

        Args:
            user_path: A relative path, e.g. ``"foo.prompt.json"``.

        Returns:
            Absolute, validated :class:`Path` inside the build dir.

        Raises:
            ValueError: If the path is absolute or escapes the base dir.
        """
        if os.path.isabs(user_path):
            raise ValueError("Absolute paths are not allowed")

        base = (Path(self._base_dir) / "dist" / "agentmark").resolve()
        candidate = (base / user_path).resolve()

        # Treat the base itself as the only valid "equal" target — any
        # other resolved path must live strictly under it.
        if candidate != base and not _is_relative_to(candidate, base):
            raise ValueError("Access denied: path outside allowed directory")

        return candidate

    async def load(
        self, path: str, prompt_type: PromptKind, options: dict[str, Any] | None = None
    ) -> Any:
        """Load a pre-built prompt and return its AST.

        Mirrors the TS ``FileLoader.load`` contract: reads
        ``<base_dir>/dist/agentmark/<normalized>.prompt.json`` (where
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

        The dataset file should contain one JSON object per line, where
        each object has an "input" field (and optionally "expected_output").

        Example dataset file:
            {"input": {"name": "Alice"}, "expected_output": "Hello Alice"}
            {"input": {"name": "Bob"}, "expected_output": "Hello Bob"}

        Args:
            dataset_path: Path to the JSONL dataset file.
                Can be absolute or relative to the base_dir.

        Returns:
            A DatasetStream for iterating over the dataset items.
        """
        return FileDatasetStream(dataset_path, self._base_dir)


__all__ = [
    "FileLoader",
    "FileDatasetStream",
    "FileDatasetReader",
]
