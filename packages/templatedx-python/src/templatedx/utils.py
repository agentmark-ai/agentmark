"""Utility functions for templatedx."""

import json
from typing import Any


def stringify_value(value: Any) -> str:
    """Convert a value to its string representation.

    Args:
        value: Any value to stringify

    Returns:
        String representation of the value
    """
    if value is None:
        return ""
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, (list, dict)):
        return json.dumps(value)
    return str(value)
