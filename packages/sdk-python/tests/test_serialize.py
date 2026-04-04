"""Tests for serialization utilities."""

from __future__ import annotations

import dataclasses
from typing import Any

import pytest

from agentmark_sdk.serialize import MAX_SERIALIZE_LENGTH, serialize_value


class TestSerializeValue:
    """Tests for serialize_value function."""

    def test_dict(self) -> None:
        value = {"key": "value", "num": 42}
        result = serialize_value(value)
        assert result == '{"key": "value", "num": 42}'

    def test_list(self) -> None:
        value = [1, 2, "three"]
        result = serialize_value(value)
        assert result == '[1, 2, "three"]'

    def test_string(self) -> None:
        result = serialize_value("hello")
        assert result == '"hello"'

    def test_number(self) -> None:
        assert serialize_value(42) == "42"
        assert serialize_value(3.14) == "3.14"

    def test_bool(self) -> None:
        assert serialize_value(True) == "true"
        assert serialize_value(False) == "false"

    def test_none(self) -> None:
        assert serialize_value(None) == "null"

    def test_pydantic_model(self) -> None:
        pytest.importorskip("pydantic")
        from pydantic import BaseModel

        class MyModel(BaseModel):
            name: str
            count: int

        model = MyModel(name="test", count=5)
        result = serialize_value(model)
        assert '"name": "test"' in result
        assert '"count": 5' in result

    def test_dataclass(self) -> None:
        @dataclasses.dataclass
        class MyData:
            name: str
            count: int

        data = MyData(name="test", count=5)
        result = serialize_value(data)
        assert '"name": "test"' in result
        assert '"count": 5' in result

    def test_truncation(self) -> None:
        long_value = "x" * 10000
        result = serialize_value(long_value, max_length=100)
        assert len(result) == 100

    def test_default_max_length(self) -> None:
        long_dict = {"data": "x" * 10000}
        result = serialize_value(long_dict)
        assert len(result) <= MAX_SERIALIZE_LENGTH

    def test_non_serializable_fallback(self) -> None:
        class Custom:
            def __str__(self) -> str:
                return "Custom()"

        result = serialize_value(Custom())
        assert "Custom()" in result

    def test_nested_structure(self) -> None:
        value: dict[str, Any] = {
            "items": [{"id": 1}, {"id": 2}],
            "metadata": {"nested": True},
        }
        result = serialize_value(value)
        assert '"items"' in result
        assert '"metadata"' in result

    def test_datetime_uses_default_str(self) -> None:
        from datetime import datetime

        dt = datetime(2024, 1, 15, 12, 0, 0)
        value = {"timestamp": dt}
        result = serialize_value(value)
        assert "2024-01-15" in result
