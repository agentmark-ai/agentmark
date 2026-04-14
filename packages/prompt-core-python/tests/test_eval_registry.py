"""Tests for EvalRegistry (plain dict type alias) in AgentMark client."""

from agentmark.prompt_core import EvalRegistry


class TestEvalRegistry:
    """Tests for EvalRegistry as a plain dict."""

    def test_plain_dict_creation(self) -> None:
        """Test creating a registry as a plain dict."""

        def my_fn(_params: dict) -> dict:
            return {"passed": True}

        registry: EvalRegistry = {"my_fn": my_fn}
        assert registry.get("my_fn") is my_fn

    def test_get_nonexistent(self) -> None:
        """Test getting a nonexistent key returns None."""
        registry: EvalRegistry = {}
        assert registry.get("nonexistent") is None

    def test_key_presence(self) -> None:
        """Test checking key presence with `in`."""

        def my_fn(_params: dict) -> dict:
            return {"passed": True}

        registry: EvalRegistry = {"my_fn": my_fn}
        assert "my_fn" in registry
        assert "nonexistent" not in registry

    def test_dict_get(self) -> None:
        """Test dict .get() returns the function."""

        def my_fn(_params: dict) -> dict:
            return {"passed": True}

        registry: EvalRegistry = {"my_fn": my_fn}
        fn = registry.get("my_fn")
        assert fn is my_fn

    def test_multiple_entries(self) -> None:
        """Test creating a registry with multiple functions."""

        def fn1(_params: dict) -> dict:
            return {"passed": True}

        def fn2(_params: dict) -> dict:
            return {"passed": False}

        registry: EvalRegistry = {"fn1": fn1, "fn2": fn2}
        assert set(registry.keys()) == {"fn1", "fn2"}

    def test_empty_registry(self) -> None:
        """Test creating an empty registry."""
        registry: EvalRegistry = {}
        assert len(registry) == 0
        assert list(registry.keys()) == []

    def test_overwrite_entry(self) -> None:
        """Test overwriting an existing function."""

        def fn_v1(_params: dict) -> dict:
            return {"score": 0.5}

        def fn_v2(_params: dict) -> dict:
            return {"score": 1.0}

        registry: EvalRegistry = {"my_fn": fn_v1}
        registry["my_fn"] = fn_v2
        assert registry.get("my_fn") is fn_v2

    def test_delete_entry(self) -> None:
        """Test deleting a function from the registry."""

        def my_fn(_params: dict) -> dict:
            return {"passed": True}

        registry: EvalRegistry = {"my_fn": my_fn}
        del registry["my_fn"]
        assert registry.get("my_fn") is None
