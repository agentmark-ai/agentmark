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


class FileDatasetReader:
    """A dataset reader that reads JSONL files line by line."""

    def __init__(self, file_path: str, base_dir: str | None = None) -> None:
        """Initialize the reader.

        Args:
            file_path: Path to the JSONL dataset file.
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

    async def load(
        self, path: str, prompt_type: PromptKind, options: dict[str, Any] | None = None
    ) -> Any:
        """Load a prompt from a file path.

        Note: For webhook-based execution, prompts are typically passed
        as AST directly from the CLI. This method is provided for
        completeness but may not be used in typical dev server scenarios.

        Args:
            path: Path to the prompt file.
            prompt_type: Type of prompt (text, object, image, speech).
            options: Additional options.

        Returns:
            The loaded prompt AST.

        Raises:
            NotImplementedError: Currently not implemented for file loading.
        """
        raise NotImplementedError(
            "FileLoader.load() is not implemented. "
            "Prompts are typically passed as AST from the CLI."
        )

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
