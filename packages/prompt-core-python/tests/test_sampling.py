"""Tests for dataset sampling utilities, including cross-runtime PRNG verification."""

from __future__ import annotations

import pytest

from agentmark.prompt_core.sampling import (
    SamplingOptions,
    apply_sampling,
    parse_row_selection,
    parse_split_spec,
    seeded_random,
    should_include_row,
    validate_sampling_options,
)


class TestSeededRandomCrossRuntime:
    """Cross-runtime verification: Python must produce identical values to TypeScript.

    Reference values computed from the TypeScript implementation:
      seededRandom(42, i) for i in [0, 4]
    """

    # TypeScript reference: seededRandom(42, i) for i in 0..4
    TS_REFERENCE = [
        (42, 0, 0.601104),
        (42, 1, 0.999811),
        (42, 2, 0.836180),
        (42, 3, 0.037196),
        (42, 4, 0.060074),
    ]

    @pytest.mark.parametrize("seed,index,expected", TS_REFERENCE)
    def test_matches_typescript_reference(self, seed: int, index: int, expected: float) -> None:
        """Python seeded_random must produce identical values to TypeScript for the same seed+index."""
        result = seeded_random(seed, index)
        assert abs(result - expected) < 1e-6, (
            f"seeded_random({seed}, {index}) = {result:.6f}, expected {expected:.6f} "
            f"(TypeScript reference). PRNG mismatch between runtimes."
        )

    def test_different_seeds_produce_different_values(self) -> None:
        val_42 = seeded_random(42, 0)
        val_99 = seeded_random(99, 0)
        assert val_42 != val_99

    def test_different_indices_produce_different_values(self) -> None:
        val_0 = seeded_random(42, 0)
        val_1 = seeded_random(42, 1)
        assert val_0 != val_1

    def test_returns_value_in_unit_interval(self) -> None:
        for i in range(100):
            val = seeded_random(42, i)
            assert 0.0 <= val < 1.0, f"seeded_random(42, {i}) = {val} is outside [0, 1)"


class TestParseRowSelection:
    def test_single_index(self) -> None:
        assert parse_row_selection("5") == [5]

    def test_multiple_indices(self) -> None:
        assert parse_row_selection("0,3,7") == [0, 3, 7]

    def test_range(self) -> None:
        assert parse_row_selection("2-5") == [2, 3, 4, 5]

    def test_mixed(self) -> None:
        assert parse_row_selection("0,3-5,9") == [0, 3, 4, 5, 9]

    def test_deduplication(self) -> None:
        assert parse_row_selection("1,1,2") == [1, 2]

    def test_empty_raises(self) -> None:
        with pytest.raises(ValueError, match="empty"):
            parse_row_selection("")

    def test_reversed_range_raises(self) -> None:
        with pytest.raises(ValueError, match="greater than end"):
            parse_row_selection("5-2")

    def test_invalid_token_raises(self) -> None:
        with pytest.raises(ValueError):
            parse_row_selection("abc")


class TestParseSplitSpec:
    def test_train(self) -> None:
        result = parse_split_spec("train:80")
        assert result == {"portion": "train", "percentage": 80}

    def test_test(self) -> None:
        result = parse_split_spec("test:20")
        assert result == {"portion": "test", "percentage": 20}

    def test_invalid_format_raises(self) -> None:
        with pytest.raises(ValueError):
            parse_split_spec("train80")

    def test_invalid_portion_raises(self) -> None:
        with pytest.raises(ValueError, match="portion"):
            parse_split_spec("both:50")

    def test_out_of_range_raises(self) -> None:
        with pytest.raises(ValueError, match="percentage"):
            parse_split_spec("train:100")


class TestValidateSamplingOptions:
    def test_valid_sample(self) -> None:
        validate_sampling_options({"sample": 50})

    def test_valid_rows(self) -> None:
        validate_sampling_options({"rows": [0, 1, 2]})

    def test_valid_split(self) -> None:
        validate_sampling_options({"split": {"portion": "train", "percentage": 80}})

    def test_mutually_exclusive_raises(self) -> None:
        with pytest.raises(ValueError, match="mutually exclusive"):
            validate_sampling_options({"sample": 50, "rows": [0, 1]})  # type: ignore[arg-type]

    def test_invalid_sample_percentage(self) -> None:
        with pytest.raises(ValueError):
            validate_sampling_options({"sample": 0})

    def test_invalid_seed(self) -> None:
        with pytest.raises(ValueError, match="finite"):
            validate_sampling_options({"seed": float("inf")})  # type: ignore[arg-type]


class TestApplySampling:
    def test_no_options_returns_all(self) -> None:
        rows = [{"a": i} for i in range(10)]
        result = apply_sampling(rows, {})
        assert result == rows

    def test_sample_with_seed_is_deterministic(self) -> None:
        rows = list(range(100))
        opts: SamplingOptions = {"sample": 30, "seed": 42}
        result1 = apply_sampling(rows, opts)
        result2 = apply_sampling(rows, opts)
        assert result1 == result2
        assert len(result1) > 0

    def test_rows_selection(self) -> None:
        rows = list(range(10))
        result = apply_sampling(rows, {"rows": [0, 3, 7]})
        assert result == [0, 3, 7]

    def test_rows_out_of_bounds_raises(self) -> None:
        rows = list(range(5))
        with pytest.raises(ValueError, match="out of bounds"):
            apply_sampling(rows, {"rows": [10]})

    def test_split_train_positional(self) -> None:
        rows = list(range(10))
        result = apply_sampling(rows, {"split": {"portion": "train", "percentage": 80}})
        assert result == list(range(8))

    def test_split_test_positional(self) -> None:
        rows = list(range(10))
        result = apply_sampling(rows, {"split": {"portion": "test", "percentage": 80}})
        assert result == [8, 9]

    def test_split_train_test_mutually_exclusive_with_seed(self) -> None:
        rows = list(range(100))
        seed = 42
        train = set(apply_sampling(rows, {"split": {"portion": "train", "percentage": 70}, "seed": seed}))
        test = set(apply_sampling(rows, {"split": {"portion": "test", "percentage": 70}, "seed": seed}))
        assert train.isdisjoint(test)
        assert train | test == set(rows)
