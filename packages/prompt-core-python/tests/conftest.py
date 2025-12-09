"""Pytest configuration and fixtures."""

import json
from pathlib import Path

import pytest


@pytest.fixture
def fixtures_dir() -> Path:
    """Get the fixtures directory path."""
    return Path(__file__).parent / "fixtures"


@pytest.fixture
def math_ast(fixtures_dir: Path) -> dict:
    """Load the math prompt AST fixture."""
    with open(fixtures_dir / "math.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def image_ast(fixtures_dir: Path) -> dict:
    """Load the image prompt AST fixture."""
    with open(fixtures_dir / "image.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def speech_ast(fixtures_dir: Path) -> dict:
    """Load the speech prompt AST fixture."""
    with open(fixtures_dir / "speech.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def attachments_ast(fixtures_dir: Path) -> dict:
    """Load the attachments prompt AST fixture."""
    with open(fixtures_dir / "attachments.prompt.mdx.json") as f:
        return json.load(f)


@pytest.fixture
def text_ast(fixtures_dir: Path) -> dict:
    """Load a text prompt AST fixture."""
    with open(fixtures_dir / "text.prompt.mdx.json") as f:
        return json.load(f)
