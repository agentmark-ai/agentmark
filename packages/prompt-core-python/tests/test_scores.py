"""Tests for score conversion and serialization utilities."""

import pytest

from agentmark.prompt_core import to_stored_score, serialize_score_registry
from agentmark.prompt_core.types import ScoreRegistry


class TestToStoredScoreBooleanSchema:
    """Tests for to_stored_score with boolean schema."""

    schema = {"type": "boolean"}

    def test_should_convert_passed_true_to_score_1_and_pass_label(self) -> None:
        result = to_stored_score(self.schema, {"passed": True})
        assert result == {
            "score": 1,
            "label": "PASS",
            "reason": "",
            "dataType": "boolean",
        }

    def test_should_convert_passed_false_to_score_0_and_fail_label(self) -> None:
        result = to_stored_score(self.schema, {"passed": False})
        assert result == {
            "score": 0,
            "label": "FAIL",
            "reason": "",
            "dataType": "boolean",
        }

    def test_should_preserve_reason(self) -> None:
        result = to_stored_score(self.schema, {"passed": True, "reason": "Exact match"})
        assert result == {
            "score": 1,
            "label": "PASS",
            "reason": "Exact match",
            "dataType": "boolean",
        }

    def test_should_fall_back_to_score_gte_half_when_passed_is_missing(self) -> None:
        high = to_stored_score(self.schema, {"score": 0.8})
        assert high == {
            "score": 1,
            "label": "PASS",
            "reason": "",
            "dataType": "boolean",
        }

        low = to_stored_score(self.schema, {"score": 0.3})
        assert low == {
            "score": 0,
            "label": "FAIL",
            "reason": "",
            "dataType": "boolean",
        }

    def test_should_treat_score_exactly_half_as_pass(self) -> None:
        result = to_stored_score(self.schema, {"score": 0.5})
        assert result["label"] == "PASS"
        assert result["score"] == 1

    def test_should_default_to_fail_when_neither_passed_nor_score_provided(self) -> None:
        result = to_stored_score(self.schema, {})
        assert result == {
            "score": 0,
            "label": "FAIL",
            "reason": "",
            "dataType": "boolean",
        }


class TestToStoredScoreNumericSchema:
    """Tests for to_stored_score with numeric schema."""

    schema = {"type": "numeric", "min": 1, "max": 5}

    def test_should_pass_through_score_within_range(self) -> None:
        result = to_stored_score(self.schema, {"score": 4.2})
        assert result == {
            "score": 4.2,
            "label": "4.2",
            "reason": "",
            "dataType": "numeric",
        }

    def test_should_clamp_score_to_min_when_below_range(self) -> None:
        result = to_stored_score(self.schema, {"score": -1})
        assert result == {
            "score": 1,
            "label": "1",
            "reason": "",
            "dataType": "numeric",
        }

    def test_should_clamp_score_to_max_when_above_range(self) -> None:
        result = to_stored_score(self.schema, {"score": 10})
        assert result == {
            "score": 5,
            "label": "5",
            "reason": "",
            "dataType": "numeric",
        }

    def test_should_clamp_default_zero_to_min_when_score_missing(self) -> None:
        result = to_stored_score(self.schema, {"reason": "N/A"})
        assert result == {
            "score": 1,
            "label": "1",
            "reason": "N/A",
            "dataType": "numeric",
        }

    def test_should_pass_through_when_no_bounds_defined(self) -> None:
        unbounded = {"type": "numeric"}
        result = to_stored_score(unbounded, {"score": 999})
        assert result == {
            "score": 999,
            "label": "999",
            "reason": "",
            "dataType": "numeric",
        }

    def test_should_handle_exact_boundary_values(self) -> None:
        at_min = to_stored_score(self.schema, {"score": 1})
        assert at_min["score"] == 1

        at_max = to_stored_score(self.schema, {"score": 5})
        assert at_max["score"] == 5


class TestToStoredScoreCategoricalSchema:
    """Tests for to_stored_score with categorical schema."""

    schema = {
        "type": "categorical",
        "categories": [
            {"label": "good", "value": 1},
            {"label": "bad", "value": 0},
        ],
    }

    def test_should_map_label_to_configured_numeric_value(self) -> None:
        good = to_stored_score(self.schema, {"label": "good"})
        assert good == {
            "score": 1,
            "label": "good",
            "reason": "",
            "dataType": "categorical",
        }

        bad = to_stored_score(self.schema, {"label": "bad"})
        assert bad == {
            "score": 0,
            "label": "bad",
            "reason": "",
            "dataType": "categorical",
        }

    def test_should_default_score_to_zero_when_label_not_in_categories(self) -> None:
        result = to_stored_score(self.schema, {"label": "unknown"})
        assert result == {
            "score": 0,
            "label": "unknown",
            "reason": "",
            "dataType": "categorical",
        }

    def test_should_default_label_to_empty_string_when_missing(self) -> None:
        result = to_stored_score(self.schema, {})
        assert result == {
            "score": 0,
            "label": "",
            "reason": "",
            "dataType": "categorical",
        }

    def test_should_preserve_reason(self) -> None:
        result = to_stored_score(self.schema, {"label": "bad", "reason": "Off-topic"})
        assert result == {
            "score": 0,
            "label": "bad",
            "reason": "Off-topic",
            "dataType": "categorical",
        }


class TestToStoredScoreEquivalence:
    """Eval/annotation equivalence: same schema + result produces same output."""

    def test_should_produce_identical_output_for_boolean_eval_and_annotation(self) -> None:
        schema = {"type": "boolean"}
        from_eval = to_stored_score(schema, {"passed": True, "reason": "Match"})
        from_annotation = to_stored_score(schema, {"passed": True, "reason": "Match"})
        assert from_eval == from_annotation

    def test_should_produce_identical_output_for_numeric_eval_and_annotation(self) -> None:
        schema = {"type": "numeric", "min": 1, "max": 5}
        from_eval = to_stored_score(schema, {"score": 4.2, "reason": "Good"})
        from_annotation = to_stored_score(schema, {"score": 4.2, "reason": "Good"})
        assert from_eval == from_annotation

    def test_should_produce_identical_output_for_categorical_eval_and_annotation(self) -> None:
        schema = {
            "type": "categorical",
            "categories": [
                {"label": "good", "value": 1},
                {"label": "bad", "value": 0},
            ],
        }
        from_eval = to_stored_score(schema, {"label": "good", "reason": "Nice tone"})
        from_annotation = to_stored_score(schema, {"label": "good", "reason": "Nice tone"})
        assert from_eval == from_annotation

    def test_should_include_data_type_in_output_for_all_types(self) -> None:
        assert to_stored_score({"type": "boolean"}, {"passed": True})["dataType"] == "boolean"
        assert to_stored_score({"type": "numeric"}, {"score": 1})["dataType"] == "numeric"
        assert to_stored_score(
            {"type": "categorical", "categories": [{"label": "a", "value": 1}]},
            {"label": "a"},
        )["dataType"] == "categorical"


class TestSerializeScoreRegistry:
    """Tests for serialize_score_registry."""

    def test_should_strip_eval_functions_and_set_has_eval_flag(self) -> None:
        async def eval_fn(_params: dict) -> dict:
            return {"passed": True}

        registry: ScoreRegistry = {
            "accuracy": {
                "schema": {"type": "boolean"},
                "eval": eval_fn,
            },
            "quality": {
                "schema": {"type": "numeric", "min": 1, "max": 5},
                "description": "Overall quality",
            },
        }

        result = serialize_score_registry(registry)

        assert result == [
            {"name": "accuracy", "schema": {"type": "boolean"}, "hasEval": True},
            {
                "name": "quality",
                "schema": {"type": "numeric", "min": 1, "max": 5},
                "description": "Overall quality",
                "hasEval": False,
            },
        ]

    def test_should_return_empty_list_for_empty_registry(self) -> None:
        assert serialize_score_registry({}) == []

    def test_should_handle_all_three_schema_types(self) -> None:
        registry: ScoreRegistry = {
            "a": {"schema": {"type": "boolean"}},
            "b": {"schema": {"type": "numeric", "min": 0, "max": 100}},
            "c": {
                "schema": {
                    "type": "categorical",
                    "categories": [
                        {"label": "good", "value": 1},
                        {"label": "bad", "value": 0},
                    ],
                },
            },
        }

        result = serialize_score_registry(registry)
        assert len(result) == 3
        assert result[0]["schema"]["type"] == "boolean"
        assert result[1]["schema"]["type"] == "numeric"
        assert result[2]["schema"]["type"] == "categorical"

    def test_should_omit_description_when_not_provided(self) -> None:
        registry: ScoreRegistry = {
            "test": {"schema": {"type": "boolean"}},
        }

        result = serialize_score_registry(registry)
        assert "description" not in result[0]

    def test_should_omit_description_when_empty_string(self) -> None:
        registry: ScoreRegistry = {
            "test": {"schema": {"type": "boolean"}, "description": ""},
        }

        result = serialize_score_registry(registry)
        assert "description" not in result[0]
