"""Serialization utilities for observed function IO capture."""

from __future__ import annotations

import dataclasses
import json
from typing import Any

MAX_SERIALIZE_LENGTH = 1_000_000


def serialize_value(value: Any, max_length: int = MAX_SERIALIZE_LENGTH) -> str:
    """Serialize a value to a JSON string for span attributes.

    Serialization chain:
      1. Pydantic model → .model_dump() → JSON
      2. Dataclass → dataclasses.asdict() → JSON
      3. Dict/list/primitive → JSON directly
      4. Fallback → str(obj)

    Truncated to max_length characters.
    """
    try:
        if hasattr(value, "model_dump"):
            serialized = json.dumps(value.model_dump(), default=str)
        elif dataclasses.is_dataclass(value) and not isinstance(value, type):
            serialized = json.dumps(dataclasses.asdict(value), default=str)
        else:
            serialized = json.dumps(value, default=str)
    except (TypeError, ValueError, OverflowError):
        serialized = str(value)

    return serialized[:max_length]
