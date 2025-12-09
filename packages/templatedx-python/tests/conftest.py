"""Pytest configuration and fixtures."""

import pytest

from templatedx import TemplateDX


@pytest.fixture
def engine() -> TemplateDX:
    """Create a fresh TemplateDX engine for each test."""
    return TemplateDX()
