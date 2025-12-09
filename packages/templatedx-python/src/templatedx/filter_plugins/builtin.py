"""Built-in filter functions for templatedx."""

import json
from typing import Any
from urllib.parse import quote

from ..filter_registry import FilterFunction, FilterRegistry


def capitalize(value: Any) -> Any:
    """Capitalize only the first character of the string.

    Args:
        value: Input value (should be string)

    Returns:
        String with first character capitalized, or original value if not string
    """
    if not isinstance(value, str):
        return value
    if not value:
        return value
    return value[0].upper() + value[1:]


def upper(value: Any) -> Any:
    """Uppercase the string.

    Args:
        value: Input value (should be string)

    Returns:
        Uppercased string, or original value if not string
    """
    if not isinstance(value, str):
        return value
    return value.upper()


def lower(value: Any) -> Any:
    """Lowercase the string.

    Args:
        value: Input value (should be string)

    Returns:
        Lowercased string, or original value if not string
    """
    if not isinstance(value, str):
        return value
    return value.lower()


def truncate(value: Any, length: int) -> Any:
    """Truncate string to length with ellipsis.

    Args:
        value: Input value (should be string)
        length: Maximum length

    Returns:
        Truncated string with "..." suffix, or original value if not string
    """
    if not isinstance(value, str):
        return value
    if len(value) <= length:
        return value
    return value[:length] + "..."


def abs_filter(value: Any) -> Any:
    """Absolute value.

    Args:
        value: Input value (should be number)

    Returns:
        Absolute value
    """
    return abs(value)


def join(value: Any, separator: str = ", ") -> Any:
    """Join array elements with separator.

    Args:
        value: Input value (should be list)
        separator: Separator string (default: ", ")

    Returns:
        Joined string, or original value if not list
    """
    if not isinstance(value, list):
        return value
    return separator.join(str(item) for item in value)


def round_filter(value: Any, decimals: int = 0) -> Any:
    """Round number to specified decimal places.

    Uses the same rounding approach as TypeScript for consistency.

    Args:
        value: Input value (should be number)
        decimals: Number of decimal places (default: 0)

    Returns:
        Rounded number
    """
    # Match TypeScript behavior for rounding
    multiplier = 10**decimals
    result = round(value * multiplier) / multiplier
    # For integers, return int
    if decimals == 0:
        return int(result)
    return result


def replace(value: Any, search: str, replacement: str) -> Any:
    """Replace all occurrences of search with replacement.

    Args:
        value: Input value (should be string)
        search: String to search for
        replacement: Replacement string

    Returns:
        String with replacements, or original value if not string
    """
    if not isinstance(value, str):
        return value
    return value.replace(search, replacement)


def urlencode(value: Any) -> Any:
    """URL encode the string.

    Args:
        value: Input value (should be string)

    Returns:
        URL encoded string, or original value if not string
    """
    if not isinstance(value, str):
        return value
    return quote(value, safe="")


def dump(value: Any) -> str:
    """JSON stringify the value.

    Args:
        value: Any value

    Returns:
        JSON string representation
    """
    return json.dumps(value)


# Dictionary of all built-in filters
BUILTIN_FILTERS: dict[str, FilterFunction] = {
    "capitalize": capitalize,
    "upper": upper,
    "lower": lower,
    "truncate": truncate,
    "abs": abs_filter,
    "join": join,
    "round": round_filter,
    "replace": replace,
    "urlencode": urlencode,
    "dump": dump,
}


def register_builtin_filters() -> None:
    """Register all built-in filters globally."""
    for name, func in BUILTIN_FILTERS.items():
        FilterRegistry.register_global(name, func)
