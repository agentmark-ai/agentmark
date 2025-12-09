"""Tests for built-in filters."""


from templatedx.filter_plugins.builtin import (
    abs_filter,
    capitalize,
    dump,
    join,
    lower,
    replace,
    round_filter,
    truncate,
    upper,
    urlencode,
)


class TestCapitalize:
    """Tests for the capitalize filter."""

    def test_capitalize_lowercase(self) -> None:
        assert capitalize("hello") == "Hello"

    def test_capitalize_uppercase(self) -> None:
        assert capitalize("HELLO") == "HELLO"

    def test_capitalize_mixed(self) -> None:
        assert capitalize("capitalize") == "Capitalize"

    def test_capitalize_empty(self) -> None:
        assert capitalize("") == ""

    def test_capitalize_non_string(self) -> None:
        assert capitalize(123) == 123  # type: ignore


class TestUpper:
    """Tests for the upper filter."""

    def test_upper_lowercase(self) -> None:
        assert upper("hello") == "HELLO"

    def test_upper_mixed(self) -> None:
        assert upper("uPper") == "UPPER"

    def test_upper_non_string(self) -> None:
        assert upper(123) == 123  # type: ignore


class TestLower:
    """Tests for the lower filter."""

    def test_lower_uppercase(self) -> None:
        assert lower("HELLO") == "hello"

    def test_lower_mixed(self) -> None:
        assert lower("LOwEr") == "lower"

    def test_lower_non_string(self) -> None:
        assert lower(123) == 123  # type: ignore


class TestTruncate:
    """Tests for the truncate filter."""

    def test_truncate_longer(self) -> None:
        assert truncate("truncate", 4) == "trun..."

    def test_truncate_shorter(self) -> None:
        assert truncate("hi", 5) == "hi"

    def test_truncate_exact(self) -> None:
        assert truncate("hello", 5) == "hello"

    def test_truncate_non_string(self) -> None:
        assert truncate(123, 2) == 123  # type: ignore


class TestAbs:
    """Tests for the abs filter."""

    def test_abs_negative(self) -> None:
        assert abs_filter(-3) == 3

    def test_abs_positive(self) -> None:
        assert abs_filter(3) == 3

    def test_abs_zero(self) -> None:
        assert abs_filter(0) == 0

    def test_abs_float(self) -> None:
        assert abs_filter(-3.14) == 3.14


class TestJoin:
    """Tests for the join filter."""

    def test_join_default_separator(self) -> None:
        assert join(["a", "b", "c"]) == "a, b, c"

    def test_join_custom_separator(self) -> None:
        assert join(["a", "b", "c"], "-") == "a-b-c"

    def test_join_empty(self) -> None:
        assert join([]) == ""

    def test_join_single(self) -> None:
        assert join(["a"]) == "a"

    def test_join_non_list(self) -> None:
        assert join("string") == "string"  # type: ignore

    def test_join_numbers(self) -> None:
        assert join([1, 2, 3], ", ") == "1, 2, 3"


class TestRound:
    """Tests for the round filter."""

    def test_round_default(self) -> None:
        assert round_filter(3.14) == 3

    def test_round_one_decimal(self) -> None:
        assert round_filter(3.14159, 1) == 3.1

    def test_round_two_decimals(self) -> None:
        assert round_filter(3.14159, 2) == 3.14

    def test_round_up(self) -> None:
        assert round_filter(3.5) == 4

    def test_round_down(self) -> None:
        assert round_filter(3.4) == 3


class TestReplace:
    """Tests for the replace filter."""

    def test_replace_single(self) -> None:
        assert replace("Hello world", "world", "Jimmy") == "Hello Jimmy"

    def test_replace_multiple(self) -> None:
        assert replace("a-b-c", "-", "_") == "a_b_c"

    def test_replace_not_found(self) -> None:
        assert replace("hello", "x", "y") == "hello"

    def test_replace_non_string(self) -> None:
        assert replace(123, "1", "2") == 123  # type: ignore


class TestUrlencode:
    """Tests for the urlencode filter."""

    def test_urlencode_ampersand(self) -> None:
        assert urlencode("&") == "%26"

    def test_urlencode_space(self) -> None:
        assert urlencode(" ") == "%20"

    def test_urlencode_query(self) -> None:
        assert urlencode("a=1&b=2") == "a%3D1%26b%3D2"

    def test_urlencode_non_string(self) -> None:
        assert urlencode(123) == 123  # type: ignore


class TestDump:
    """Tests for the dump filter."""

    def test_dump_dict(self) -> None:
        result = dump({"a": "b", "c": [1, 2, 3]})
        assert result == '{"a": "b", "c": [1, 2, 3]}'

    def test_dump_list(self) -> None:
        assert dump([1, 2]) == "[1, 2]"

    def test_dump_string(self) -> None:
        assert dump("hello") == '"hello"'

    def test_dump_number(self) -> None:
        assert dump(42) == "42"

    def test_dump_nested(self) -> None:
        result = dump({"a": 1, "b": [1, 2], "c": "hello"})
        assert result == '{"a": 1, "b": [1, 2], "c": "hello"}'
