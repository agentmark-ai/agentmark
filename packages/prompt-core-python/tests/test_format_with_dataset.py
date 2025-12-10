"""Tests for format_with_dataset functionality."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from agentmark.prompt_core import (
    AgentMark,
    SimpleDatasetReader,
    SimpleDatasetStream,
)
from agentmark.prompt_core.prompts.base import BasePrompt


class TestSimpleDatasetStream:
    """Tests for SimpleDatasetStream."""

    def test_get_reader(self) -> None:
        """Test getting a reader from the stream."""
        items = [{"input": {"name": "Alice"}, "expected_output": "Hello Alice"}]
        stream = SimpleDatasetStream(items)
        reader = stream.get_reader()

        assert isinstance(reader, SimpleDatasetReader)

    @pytest.mark.asyncio
    async def test_read_items(self) -> None:
        """Test reading items from the stream."""
        items = [
            {"input": {"name": "Alice"}, "expected_output": "Hello Alice"},
            {"input": {"name": "Bob"}, "expected_output": "Hello Bob"},
        ]
        stream = SimpleDatasetStream(items)
        reader = stream.get_reader()

        # Read first item
        result1 = await reader.read()
        assert result1["done"] is False
        assert result1["value"]["input"]["name"] == "Alice"

        # Read second item
        result2 = await reader.read()
        assert result2["done"] is False
        assert result2["value"]["input"]["name"] == "Bob"

        # Read after end
        result3 = await reader.read()
        assert result3["done"] is True

    @pytest.mark.asyncio
    async def test_empty_stream(self) -> None:
        """Test reading from an empty stream."""
        stream = SimpleDatasetStream([])
        reader = stream.get_reader()

        result = await reader.read()
        assert result["done"] is True


class TestFormatWithDataset:
    """Tests for format_with_dataset method."""

    @pytest.fixture
    def mock_loader(self) -> MagicMock:
        """Create a mock loader."""
        loader = MagicMock()

        async def mock_load_dataset(path: str) -> SimpleDatasetStream:
            return SimpleDatasetStream([
                {"input": {"name": "Alice"}, "expected_output": "Hello Alice"},
                {"input": {"name": "Bob"}, "expected_output": "Hello Bob"},
            ])

        loader.load_dataset = mock_load_dataset
        return loader

    @pytest.fixture
    def mock_engine(self) -> MagicMock:
        """Create a mock template engine."""
        engine = MagicMock()
        engine.compile = AsyncMock(return_value={"messages": []})
        return engine

    @pytest.fixture
    def mock_adapter(self) -> MagicMock:
        """Create a mock adapter."""
        adapter = MagicMock()
        adapter.adapt_text = MagicMock(return_value={"model": "test"})
        return adapter

    @pytest.mark.asyncio
    async def test_format_with_dataset_no_loader(
        self,
        mock_engine: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test that format_with_dataset raises when no loader is configured."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=None,  # No loader
        )

        with pytest.raises(ValueError, match="No loader configured"):
            await prompt.format_with_dataset(dataset_path="test.jsonl")

    @pytest.mark.asyncio
    async def test_format_with_dataset_no_path(
        self,
        mock_loader: MagicMock,
        mock_engine: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test that format_with_dataset raises when no path is provided."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=mock_loader,
            test_settings=None,  # No test_settings.dataset
        )

        with pytest.raises(ValueError, match="No dataset path provided"):
            await prompt.format_with_dataset()

    @pytest.mark.asyncio
    async def test_format_with_dataset_explicit_path(
        self,
        mock_loader: MagicMock,
        mock_engine: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test format_with_dataset with explicit dataset path."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=mock_loader,
        )

        result = await prompt.format_with_dataset(dataset_path="test.jsonl")

        assert isinstance(result, SimpleDatasetStream)

        # Read all items
        reader = result.get_reader()
        items: list[dict[str, Any]] = []
        while True:
            read_result = await reader.read()
            if read_result.get("done"):
                break
            items.append(read_result["value"])

        assert len(items) == 2
        assert items[0]["type"] == "dataset"
        assert items[0]["dataset"]["input"]["name"] == "Alice"
        assert items[1]["dataset"]["input"]["name"] == "Bob"

    @pytest.mark.asyncio
    async def test_format_with_dataset_from_test_settings(
        self,
        mock_loader: MagicMock,
        mock_engine: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test format_with_dataset using dataset path from test_settings."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=mock_loader,
            test_settings={"dataset": "default.jsonl"},
        )

        result = await prompt.format_with_dataset()

        assert isinstance(result, SimpleDatasetStream)

    @pytest.mark.asyncio
    async def test_format_with_dataset_includes_evals(
        self,
        mock_loader: MagicMock,
        mock_engine: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test that format_with_dataset includes evals from test_settings."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=mock_loader,
            test_settings={
                "dataset": "test.jsonl",
                "evals": ["accuracy", "coherence"],
            },
        )

        result = await prompt.format_with_dataset()

        # Read first item
        reader = result.get_reader()
        first = await reader.read()

        assert first["value"]["evals"] == ["accuracy", "coherence"]

    @pytest.mark.asyncio
    async def test_format_with_dataset_handles_format_error(
        self,
        mock_loader: MagicMock,
        mock_adapter: MagicMock,
    ) -> None:
        """Test that format_with_dataset handles format errors gracefully."""
        from agentmark.prompt_core.prompts.text import TextPrompt

        # Create engine that raises on compile
        mock_engine = MagicMock()
        mock_engine.compile = AsyncMock(side_effect=ValueError("Invalid template"))

        prompt = TextPrompt(
            template={},
            engine=mock_engine,
            adapter=mock_adapter,
            loader=mock_loader,
        )

        result = await prompt.format_with_dataset(dataset_path="test.jsonl")

        # Should get error items
        reader = result.get_reader()
        first = await reader.read()

        assert first["value"]["type"] == "error"
        assert "Invalid template" in first["value"]["error"]


class TestDatasetStreamChunk:
    """Tests for dataset stream chunk format."""

    @pytest.mark.asyncio
    async def test_chunk_format(self) -> None:
        """Test that dataset chunks have the correct format."""
        items = [
            {
                "type": "dataset",
                "dataset": {"input": {"x": 1}, "expected_output": "one"},
                "evals": [],
                "formatted": {"model": "test"},
            }
        ]
        stream = SimpleDatasetStream(items)
        reader = stream.get_reader()
        result = await reader.read()

        chunk = result["value"]
        assert "type" in chunk
        assert "dataset" in chunk
        assert "evals" in chunk
        assert "formatted" in chunk
        assert chunk["type"] == "dataset"
        assert chunk["dataset"]["input"] == {"x": 1}
        assert chunk["dataset"]["expected_output"] == "one"
