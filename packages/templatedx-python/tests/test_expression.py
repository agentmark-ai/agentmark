"""Tests for expression lexer, parser, and evaluator."""

import pytest

from templatedx import EvaluationError, FilterRegistry, Scope
from templatedx.expression import ExpressionEvaluator, ExpressionLexer, ExpressionParser


class TestExpressionLexer:
    """Tests for the expression lexer."""

    def test_tokenize_identifier(self) -> None:
        lexer = ExpressionLexer("name")
        tokens = lexer.tokenize()
        assert len(tokens) == 2  # identifier + EOF
        assert tokens[0].value == "name"

    def test_tokenize_number(self) -> None:
        lexer = ExpressionLexer("42")
        tokens = lexer.tokenize()
        assert tokens[0].value == 42

    def test_tokenize_float(self) -> None:
        lexer = ExpressionLexer("3.14")
        tokens = lexer.tokenize()
        assert tokens[0].value == 3.14

    def test_tokenize_string_double_quotes(self) -> None:
        lexer = ExpressionLexer('"hello"')
        tokens = lexer.tokenize()
        assert tokens[0].value == "hello"

    def test_tokenize_string_single_quotes(self) -> None:
        lexer = ExpressionLexer("'world'")
        tokens = lexer.tokenize()
        assert tokens[0].value == "world"

    def test_tokenize_boolean_true(self) -> None:
        lexer = ExpressionLexer("true")
        tokens = lexer.tokenize()
        assert tokens[0].value is True

    def test_tokenize_boolean_false(self) -> None:
        lexer = ExpressionLexer("false")
        tokens = lexer.tokenize()
        assert tokens[0].value is False

    def test_tokenize_null(self) -> None:
        lexer = ExpressionLexer("null")
        tokens = lexer.tokenize()
        assert tokens[0].value is None

    def test_tokenize_operators(self) -> None:
        lexer = ExpressionLexer("1 + 2 * 3")
        tokens = lexer.tokenize()
        assert tokens[1].value == "+"
        assert tokens[3].value == "*"

    def test_tokenize_comparison_operators(self) -> None:
        lexer = ExpressionLexer("a == b && c != d")
        tokens = lexer.tokenize()
        assert tokens[1].value == "=="
        assert tokens[3].value == "&&"
        assert tokens[5].value == "!="


class TestExpressionParser:
    """Tests for the expression parser."""

    def parse(self, expr: str):
        lexer = ExpressionLexer(expr)
        tokens = lexer.tokenize()
        parser = ExpressionParser(tokens)
        return parser.parse()

    def test_parse_literal(self) -> None:
        from templatedx.expression import LiteralNode

        node = self.parse("42")
        assert isinstance(node, LiteralNode)
        assert node.value == 42

    def test_parse_identifier(self) -> None:
        from templatedx.expression import IdentifierNode

        node = self.parse("name")
        assert isinstance(node, IdentifierNode)
        assert node.name == "name"

    def test_parse_member_expression(self) -> None:
        from templatedx.expression import IdentifierNode, MemberExpressionNode

        node = self.parse("user.name")
        assert isinstance(node, MemberExpressionNode)
        assert isinstance(node.object, IdentifierNode)
        assert node.object.name == "user"
        assert not node.computed

    def test_parse_computed_member(self) -> None:
        from templatedx.expression import MemberExpressionNode

        node = self.parse("items[0]")
        assert isinstance(node, MemberExpressionNode)
        assert node.computed

    def test_parse_binary_expression(self) -> None:
        from templatedx.expression import BinaryExpressionNode

        node = self.parse("1 + 2")
        assert isinstance(node, BinaryExpressionNode)
        assert node.operator == "+"

    def test_parse_unary_expression(self) -> None:
        from templatedx.expression import UnaryExpressionNode

        node = self.parse("!flag")
        assert isinstance(node, UnaryExpressionNode)
        assert node.operator == "!"

    def test_parse_function_call(self) -> None:
        from templatedx.expression import CallExpressionNode

        node = self.parse("upper(name)")
        assert isinstance(node, CallExpressionNode)

    def test_parse_array(self) -> None:
        from templatedx.expression import ArrayExpressionNode

        node = self.parse("[1, 2, 3]")
        assert isinstance(node, ArrayExpressionNode)
        assert len(node.elements) == 3

    def test_parse_object(self) -> None:
        from templatedx.expression import ObjectExpressionNode

        node = self.parse('{"a": 1, "b": 2}')
        assert isinstance(node, ObjectExpressionNode)
        assert len(node.properties) == 2


class TestExpressionEvaluator:
    """Tests for the expression evaluator."""

    def setup_method(self) -> None:
        # Register test filters
        FilterRegistry.register_global("upper", lambda x: x.upper() if isinstance(x, str) else x)
        FilterRegistry.register_global("double", lambda x: x * 2)

    def create_evaluator(self, variables: dict) -> ExpressionEvaluator:
        scope = Scope(variables=variables)
        registry = FilterRegistry()
        registry.copy_from_global()
        return ExpressionEvaluator(scope, registry)

    def test_evaluate_literal(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("42") == 42
        assert evaluator.evaluate('"hello"') == "hello"
        assert evaluator.evaluate("true") is True
        assert evaluator.evaluate("null") is None

    def test_evaluate_identifier(self) -> None:
        evaluator = self.create_evaluator({"name": "Alice"})
        assert evaluator.evaluate("name") == "Alice"

    def test_evaluate_member_expression(self) -> None:
        evaluator = self.create_evaluator({"user": {"name": "Bob", "age": 30}})
        assert evaluator.evaluate("user.name") == "Bob"
        assert evaluator.evaluate("user.age") == 30

    def test_evaluate_computed_member(self) -> None:
        evaluator = self.create_evaluator({"items": ["a", "b", "c"]})
        assert evaluator.evaluate("items[0]") == "a"
        assert evaluator.evaluate("items[1]") == "b"

    def test_evaluate_binary_operators(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("1 + 2") == 3
        assert evaluator.evaluate("5 - 3") == 2
        assert evaluator.evaluate("2 * 3") == 6
        assert evaluator.evaluate("10 / 2") == 5
        assert evaluator.evaluate("7 % 3") == 1

    def test_evaluate_comparison_operators(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("1 == 1") is True
        assert evaluator.evaluate("1 != 2") is True
        assert evaluator.evaluate("2 > 1") is True
        assert evaluator.evaluate("1 < 2") is True
        assert evaluator.evaluate("2 >= 2") is True
        assert evaluator.evaluate("1 <= 1") is True

    def test_evaluate_logical_operators(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("true && true") is True
        assert evaluator.evaluate("true && false") is False
        assert evaluator.evaluate("true || false") is True
        assert evaluator.evaluate("false || false") is False

    def test_evaluate_short_circuit_and(self) -> None:
        evaluator = self.create_evaluator({})
        # Should short-circuit and not evaluate right side
        assert evaluator.evaluate("false && true") is False

    def test_evaluate_short_circuit_or(self) -> None:
        evaluator = self.create_evaluator({})
        # Should short-circuit and not evaluate right side
        assert evaluator.evaluate("true || false") is True

    def test_evaluate_unary_not(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("!true") is False
        assert evaluator.evaluate("!false") is True

    def test_evaluate_unary_minus(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate("-5") == -5

    def test_evaluate_function_call(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate('upper("hello")') == "HELLO"
        assert evaluator.evaluate("double(5)") == 10

    def test_evaluate_nested_function_call(self) -> None:
        evaluator = self.create_evaluator({})
        assert evaluator.evaluate('upper("hello")') == "HELLO"

    def test_evaluate_array(self) -> None:
        evaluator = self.create_evaluator({})
        result = evaluator.evaluate("[1, 2, 3]")
        assert result == [1, 2, 3]

    def test_evaluate_object(self) -> None:
        evaluator = self.create_evaluator({})
        result = evaluator.evaluate('{"a": 1, "b": 2}')
        assert result == {"a": 1, "b": 2}

    def test_evaluate_undefined_variable(self) -> None:
        evaluator = self.create_evaluator({})
        # Should return None for undefined variables
        assert evaluator.evaluate("undefined_var") is None

    def test_evaluate_unregistered_filter(self) -> None:
        evaluator = self.create_evaluator({})
        with pytest.raises(EvaluationError, match="not registered"):
            evaluator.evaluate('nonexistent("hello")')

    def test_evaluate_precedence(self) -> None:
        evaluator = self.create_evaluator({})
        # * has higher precedence than +
        assert evaluator.evaluate("1 + 2 * 3") == 7
        # Parentheses override precedence
        assert evaluator.evaluate("(1 + 2) * 3") == 9

    def test_evaluate_division_by_zero(self) -> None:
        evaluator = self.create_evaluator({})
        with pytest.raises(EvaluationError, match="Division by zero"):
            evaluator.evaluate("10 / 0")

    def test_evaluate_modulo_by_zero(self) -> None:
        evaluator = self.create_evaluator({})
        with pytest.raises(EvaluationError, match="Modulo by zero"):
            evaluator.evaluate("10 % 0")
