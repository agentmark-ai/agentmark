"""Pytest configuration and fixtures for Pydantic AI adapter tests."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from agentmark_pydantic_ai_v0 import (
        PydanticAIModelRegistry,
        PydanticAIToolRegistry,
    )


@pytest.fixture
def fixtures_dir() -> Path:
    """Get the fixtures directory path."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def math_ast(fixtures_dir: Path) -> dict[str, Any]:
    """Load the math prompt AST fixture (object prompt)."""
    with open(fixtures_dir / "math.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def text_ast(fixtures_dir: Path) -> dict[str, Any]:
    """Load a text prompt AST fixture."""
    with open(fixtures_dir / "text.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def image_ast(fixtures_dir: Path) -> dict[str, Any]:
    """Load the image prompt AST fixture."""
    with open(fixtures_dir / "image.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def speech_ast(fixtures_dir: Path) -> dict[str, Any]:
    """Load the speech prompt AST fixture."""
    with open(fixtures_dir / "speech.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def mock_model_registry() -> PydanticAIModelRegistry:
    """Create a model registry with a mock model creator."""
    from agentmark_pydantic_ai_v0 import PydanticAIModelRegistry

    def mock_creator(name: str, options: dict[str, Any] | None) -> str:
        """Mock model creator that returns a provider-prefixed string."""
        return f"test:{name}"

    registry = PydanticAIModelRegistry(default_creator=mock_creator)
    return registry


@pytest.fixture
def tool_registry() -> PydanticAIToolRegistry:
    """Create a tool registry with a sample tool."""
    from agentmark_pydantic_ai_v0 import PydanticAIToolRegistry

    registry = PydanticAIToolRegistry()

    def add_tool(args: dict[str, Any], ctx: dict[str, Any] | None) -> int:
        """Sample tool that adds two numbers."""
        return args["a"] + args["b"]

    registry.register("add", add_tool)
    return registry


@pytest.fixture
def tools_text_ast() -> dict[str, Any]:
    """Create a text AST fixture with tools defined."""
    return {
        "type": "root",
        "children": [
            {
                "type": "yaml",
                "value": """name: tools_prompt
text_config:
  model_name: test-model
  tools:
    add:
      description: Add two numbers
      parameters:
        type: object
        properties:
          a:
            type: integer
          b:
            type: integer
        required: [a, b]""",
            },
            {
                "type": "mdxJsxFlowElement",
                "name": "System",
                "attributes": [],
                "children": [
                    {
                        "type": "paragraph",
                        "children": [{"type": "text", "value": "You are a calculator."}],
                    }
                ],
            },
            {
                "type": "mdxJsxFlowElement",
                "name": "User",
                "attributes": [],
                "children": [
                    {
                        "type": "paragraph",
                        "children": [
                            {"type": "mdxTextExpression", "value": "props.userMessage"}
                        ],
                    }
                ],
            },
        ],
    }
