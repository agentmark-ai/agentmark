"""Tests for EvalRegistry (plain dict type alias) and ScoreRegistry in AgentMark client."""

from agentmark.prompt_core import AgentMark, DefaultAdapter, EvalRegistry
from agentmark.prompt_core.types import ScoreRegistry


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


adapter = DefaultAdapter()


class TestAgentMarkScoreRegistry:
    """Tests for ScoreRegistry integration in AgentMark client."""

    def test_should_store_score_registry_when_scores_parameter_provided(self) -> None:
        scores: ScoreRegistry = {
            "accuracy": {
                "schema": {"type": "boolean"},
                "eval": lambda _: {"passed": True},
            },
            "quality": {
                "schema": {"type": "numeric", "min": 1, "max": 5},
            },
        }

        client = AgentMark(adapter=adapter, scores=scores)
        registry = client.get_score_registry()

        assert registry is scores
        assert list(registry.keys()) == ["accuracy", "quality"]

    def test_should_wrap_bare_functions_as_schemaless_score_definitions(self) -> None:
        fn = lambda _: {"passed": True}
        legacy_registry: EvalRegistry = {"accuracy": fn}

        client = AgentMark(adapter=adapter, eval_registry=legacy_registry)
        score_registry = client.get_score_registry()

        assert "accuracy" in score_registry
        assert score_registry["accuracy"]["eval"] is fn
        # Schema is not set when wrapping legacy functions
        assert score_registry["accuracy"].get("schema") is None

    def test_should_prefer_scores_when_both_options_provided(self) -> None:
        legacy_fn = lambda _: {"passed": False}
        new_fn = lambda _: {"passed": True}

        client = AgentMark(
            adapter=adapter,
            eval_registry={"accuracy": legacy_fn},
            scores={
                "accuracy": {"schema": {"type": "boolean"}, "eval": new_fn},
            },
        )

        registry = client.get_score_registry()
        assert registry["accuracy"]["eval"] is new_fn
        assert registry["accuracy"]["schema"] == {"type": "boolean"}

    def test_should_derive_registry_from_score_entries_with_functions(self) -> None:
        fn = lambda _: {"passed": True}
        scores: ScoreRegistry = {
            "accuracy": {"schema": {"type": "boolean"}, "eval": fn},
            "quality": {"schema": {"type": "numeric", "min": 1, "max": 5}},
        }

        client = AgentMark(adapter=adapter, scores=scores)
        derived = client.get_eval_registry()

        assert derived is not None
        assert derived["accuracy"] is fn
        assert "quality" not in derived

    def test_should_return_score_registry_via_get_score_registry(self) -> None:
        scores: ScoreRegistry = {
            "accuracy": {"schema": {"type": "boolean"}},
        }

        client = AgentMark(adapter=adapter, scores=scores)
        assert client.get_score_registry() is scores

    def test_should_return_empty_score_registry_when_no_options_provided(self) -> None:
        client = AgentMark(adapter=adapter)
        assert client.get_score_registry() == {}

    def test_should_return_original_functions_when_using_legacy_option(self) -> None:
        fn = lambda _: {"passed": True}
        legacy_registry: EvalRegistry = {"accuracy": fn}

        client = AgentMark(adapter=adapter, eval_registry=legacy_registry)
        result = client.get_eval_registry()

        assert result is not None
        assert result["accuracy"] is fn
