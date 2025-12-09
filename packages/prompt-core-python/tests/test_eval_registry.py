"""Tests for EvalRegistry."""

from agentmark.prompt_core import EvalRegistry


class TestEvalRegistry:
    """Tests for EvalRegistry."""

    def test_register_single_name(self) -> None:
        """Test registering with a single name."""
        registry = EvalRegistry()

        def my_eval(_params: dict) -> dict:
            return {"passed": True}

        registry.register("my_eval", my_eval)
        assert registry.get("my_eval") is my_eval

    def test_register_multiple_names(self) -> None:
        """Test registering with multiple names."""
        registry = EvalRegistry()

        def my_eval(_params: dict) -> dict:
            return {"passed": True}

        registry.register(["eval1", "eval2"], my_eval)
        assert registry.get("eval1") is my_eval
        assert registry.get("eval2") is my_eval

    def test_get_nonexistent(self) -> None:
        """Test getting a nonexistent eval."""
        registry = EvalRegistry()
        assert registry.get("nonexistent") is None

    def test_has(self) -> None:
        """Test has method."""
        registry = EvalRegistry()

        def my_eval(_params: dict) -> dict:
            return {"passed": True}

        registry.register("my_eval", my_eval)
        assert registry.has("my_eval") is True
        assert registry.has("nonexistent") is False

    def test_remove(self) -> None:
        """Test remove method."""
        registry = EvalRegistry()

        def my_eval(_params: dict) -> dict:
            return {"passed": True}

        registry.register("my_eval", my_eval)
        assert registry.remove("my_eval") is True
        assert registry.get("my_eval") is None
        assert registry.remove("my_eval") is False

    def test_clear(self) -> None:
        """Test clear method."""
        registry = EvalRegistry()

        def eval1(_params: dict) -> dict:
            return {"passed": True}

        def eval2(_params: dict) -> dict:
            return {"passed": False}

        registry.register("eval1", eval1)
        registry.register("eval2", eval2)
        registry.clear()
        assert registry.list_names() == []

    def test_list_names(self) -> None:
        """Test list_names method."""
        registry = EvalRegistry()

        def eval1(_params: dict) -> dict:
            return {"passed": True}

        def eval2(_params: dict) -> dict:
            return {"passed": False}

        registry.register("eval1", eval1)
        registry.register("eval2", eval2)
        names = registry.list_names()
        assert set(names) == {"eval1", "eval2"}

    def test_method_chaining(self) -> None:
        """Test that register returns self for chaining."""
        registry = EvalRegistry()

        def eval1(_params: dict) -> dict:
            return {"passed": True}

        def eval2(_params: dict) -> dict:
            return {"passed": False}

        result = registry.register("eval1", eval1).register("eval2", eval2)
        assert result is registry
        assert registry.has("eval1")
        assert registry.has("eval2")
