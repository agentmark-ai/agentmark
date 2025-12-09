"""Expression lexer, parser, and evaluator for templatedx.

This module provides a lightweight expression parser that handles:
- Identifiers: name, user
- Member access: user.name, items[0]
- Binary operators: +, -, *, /, %, ==, !=, >, >=, <, <=, &&, ||
- Unary operators: +, -, !
- Literals: strings, numbers, booleans, arrays, objects
- Function calls: round(value, 2), upper(name)
"""

from dataclasses import dataclass
from enum import Enum
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .filter_registry import FilterRegistry
    from .scope import Scope


class TokenType(Enum):
    """Token types for the expression lexer."""

    IDENTIFIER = "identifier"
    NUMBER = "number"
    STRING = "string"
    BOOLEAN = "boolean"
    NULL = "null"
    OPERATOR = "operator"
    DOT = "dot"
    COMMA = "comma"
    COLON = "colon"
    PAREN_OPEN = "paren_open"
    PAREN_CLOSE = "paren_close"
    BRACKET_OPEN = "bracket_open"
    BRACKET_CLOSE = "bracket_close"
    BRACE_OPEN = "brace_open"
    BRACE_CLOSE = "brace_close"
    EOF = "eof"


@dataclass
class Token:
    """A token produced by the lexer."""

    type: TokenType
    value: Any
    position: int


class LexerError(Exception):
    """Error during lexical analysis."""

    pass


class ParseError(Exception):
    """Error during parsing."""

    pass


class EvaluationError(Exception):
    """Error during expression evaluation."""

    pass


class ExpressionLexer:
    """Tokenizes expression strings."""

    OPERATORS = {
        "+",
        "-",
        "*",
        "/",
        "%",
        "==",
        "!=",
        "===",
        "!==",
        ">",
        ">=",
        "<",
        "<=",
        "&&",
        "||",
        "!",
    }

    KEYWORDS = {
        "true": (TokenType.BOOLEAN, True),
        "false": (TokenType.BOOLEAN, False),
        "null": (TokenType.NULL, None),
        "undefined": (TokenType.NULL, None),
    }

    def __init__(self, expression: str) -> None:
        self.expression = expression
        self.pos = 0
        self.length = len(expression)

    def tokenize(self) -> list[Token]:
        """Tokenize the expression string.

        Returns:
            List of tokens
        """
        tokens: list[Token] = []

        while self.pos < self.length:
            self._skip_whitespace()
            if self.pos >= self.length:
                break

            char = self.expression[self.pos]

            if char == "(":
                tokens.append(Token(TokenType.PAREN_OPEN, "(", self.pos))
                self.pos += 1
            elif char == ")":
                tokens.append(Token(TokenType.PAREN_CLOSE, ")", self.pos))
                self.pos += 1
            elif char == "[":
                tokens.append(Token(TokenType.BRACKET_OPEN, "[", self.pos))
                self.pos += 1
            elif char == "]":
                tokens.append(Token(TokenType.BRACKET_CLOSE, "]", self.pos))
                self.pos += 1
            elif char == "{":
                tokens.append(Token(TokenType.BRACE_OPEN, "{", self.pos))
                self.pos += 1
            elif char == "}":
                tokens.append(Token(TokenType.BRACE_CLOSE, "}", self.pos))
                self.pos += 1
            elif char == ".":
                tokens.append(Token(TokenType.DOT, ".", self.pos))
                self.pos += 1
            elif char == ",":
                tokens.append(Token(TokenType.COMMA, ",", self.pos))
                self.pos += 1
            elif char == ":":
                tokens.append(Token(TokenType.COLON, ":", self.pos))
                self.pos += 1
            elif char in ('"', "'"):
                tokens.append(self._read_string(char))
            elif char.isdigit() or (char == "-" and self._peek_digit()):
                tokens.append(self._read_number())
            elif char.isalpha() or char == "_":
                tokens.append(self._read_identifier())
            elif self._is_operator_start(char):
                tokens.append(self._read_operator())
            else:
                raise LexerError(f"Unexpected character '{char}' at position {self.pos}")

        tokens.append(Token(TokenType.EOF, None, self.pos))
        return tokens

    def _skip_whitespace(self) -> None:
        """Skip whitespace characters."""
        while self.pos < self.length and self.expression[self.pos].isspace():
            self.pos += 1

    def _peek_digit(self) -> bool:
        """Check if the next character is a digit."""
        next_pos = self.pos + 1
        return next_pos < self.length and self.expression[next_pos].isdigit()

    def _is_operator_start(self, char: str) -> bool:
        """Check if character starts an operator."""
        return char in "+-*/%=!<>&|"

    def _read_string(self, quote: str) -> Token:
        """Read a string literal."""
        start = self.pos
        self.pos += 1  # Skip opening quote
        value = ""

        while self.pos < self.length:
            char = self.expression[self.pos]
            if char == quote:
                self.pos += 1  # Skip closing quote
                return Token(TokenType.STRING, value, start)
            if char == "\\":
                self.pos += 1
                if self.pos < self.length:
                    escaped = self.expression[self.pos]
                    if escaped == "n":
                        value += "\n"
                    elif escaped == "t":
                        value += "\t"
                    elif escaped == "r":
                        value += "\r"
                    else:
                        value += escaped
                    self.pos += 1
            else:
                value += char
                self.pos += 1

        raise LexerError(f"Unterminated string starting at position {start}")

    def _read_number(self) -> Token:
        """Read a number literal."""
        start = self.pos
        value = ""

        if self.expression[self.pos] == "-":
            value += "-"
            self.pos += 1

        while self.pos < self.length and self.expression[self.pos].isdigit():
            value += self.expression[self.pos]
            self.pos += 1

        if self.pos < self.length and self.expression[self.pos] == ".":
            value += "."
            self.pos += 1
            while self.pos < self.length and self.expression[self.pos].isdigit():
                value += self.expression[self.pos]
                self.pos += 1

        # Handle scientific notation
        if self.pos < self.length and self.expression[self.pos] in "eE":
            value += self.expression[self.pos]
            self.pos += 1
            if self.pos < self.length and self.expression[self.pos] in "+-":
                value += self.expression[self.pos]
                self.pos += 1
            while self.pos < self.length and self.expression[self.pos].isdigit():
                value += self.expression[self.pos]
                self.pos += 1

        num_value = float(value) if "." in value or "e" in value.lower() else int(value)
        return Token(TokenType.NUMBER, num_value, start)

    def _read_identifier(self) -> Token:
        """Read an identifier or keyword."""
        start = self.pos
        value = ""

        while self.pos < self.length and (
            self.expression[self.pos].isalnum() or self.expression[self.pos] == "_"
        ):
            value += self.expression[self.pos]
            self.pos += 1

        # Check for keywords
        if value in self.KEYWORDS:
            token_type, token_value = self.KEYWORDS[value]
            return Token(token_type, token_value, start)

        return Token(TokenType.IDENTIFIER, value, start)

    def _read_operator(self) -> Token:
        """Read an operator."""
        start = self.pos
        char = self.expression[self.pos]

        # Try two-character operators first
        if self.pos + 1 < self.length:
            two_char = self.expression[self.pos : self.pos + 2]
            if two_char in self.OPERATORS:
                self.pos += 2
                # Check for === or !==
                if self.pos < self.length and two_char in ("==", "!="):
                    if self.expression[self.pos] == "=":
                        self.pos += 1
                        return Token(TokenType.OPERATOR, two_char + "=", start)
                return Token(TokenType.OPERATOR, two_char, start)

        # Single character operators
        if char in self.OPERATORS:
            self.pos += 1
            return Token(TokenType.OPERATOR, char, start)

        raise LexerError(f"Unknown operator starting at position {start}")


# AST Node types
@dataclass
class ASTNode:
    """Base class for AST nodes."""

    pass


@dataclass
class LiteralNode(ASTNode):
    """A literal value (string, number, boolean, null)."""

    value: Any


@dataclass
class IdentifierNode(ASTNode):
    """An identifier (variable name)."""

    name: str


@dataclass
class MemberExpressionNode(ASTNode):
    """A member access expression (obj.prop or obj[expr])."""

    object: ASTNode
    property: ASTNode
    computed: bool  # True for obj[expr], False for obj.prop


@dataclass
class CallExpressionNode(ASTNode):
    """A function call expression."""

    callee: ASTNode
    arguments: list[ASTNode]


@dataclass
class BinaryExpressionNode(ASTNode):
    """A binary operation (a + b, a && b, etc.)."""

    operator: str
    left: ASTNode
    right: ASTNode


@dataclass
class UnaryExpressionNode(ASTNode):
    """A unary operation (!a, -a, +a)."""

    operator: str
    argument: ASTNode


@dataclass
class ArrayExpressionNode(ASTNode):
    """An array literal [a, b, c]."""

    elements: list[ASTNode]


@dataclass
class ObjectExpressionNode(ASTNode):
    """An object literal {a: 1, b: 2}."""

    properties: list[tuple[str, ASTNode]]


class ExpressionParser:
    """Parses tokens into an AST."""

    # Operator precedence (lower = binds tighter)
    PRECEDENCE = {
        "||": 1,
        "&&": 2,
        "==": 3,
        "!=": 3,
        "===": 3,
        "!==": 3,
        "<": 4,
        ">": 4,
        "<=": 4,
        ">=": 4,
        "+": 5,
        "-": 5,
        "*": 6,
        "/": 6,
        "%": 6,
    }

    def __init__(self, tokens: list[Token]) -> None:
        self.tokens = tokens
        self.pos = 0

    def parse(self) -> ASTNode:
        """Parse tokens into an AST.

        Returns:
            The root AST node
        """
        node = self._parse_expression()
        if self._current().type != TokenType.EOF:
            raise ParseError(f"Unexpected token {self._current().value} after expression")
        return node

    def _current(self) -> Token:
        """Get current token."""
        return self.tokens[self.pos]

    def _peek(self, offset: int = 1) -> Token:
        """Peek at a future token."""
        pos = self.pos + offset
        if pos < len(self.tokens):
            return self.tokens[pos]
        return self.tokens[-1]  # Return EOF

    def _advance(self) -> Token:
        """Advance to next token and return current."""
        token = self.tokens[self.pos]
        if self.pos < len(self.tokens) - 1:
            self.pos += 1
        return token

    def _expect(self, token_type: TokenType) -> Token:
        """Expect a specific token type."""
        token = self._current()
        if token.type != token_type:
            raise ParseError(f"Expected {token_type.value}, got {token.type.value}")
        return self._advance()

    def _parse_expression(self, min_precedence: int = 0) -> ASTNode:
        """Parse an expression with operator precedence."""
        left = self._parse_unary()

        while True:
            token = self._current()
            if token.type != TokenType.OPERATOR:
                break

            precedence = self.PRECEDENCE.get(token.value)
            if precedence is None or precedence < min_precedence:
                break

            operator = self._advance().value
            right = self._parse_expression(precedence + 1)
            left = BinaryExpressionNode(operator=operator, left=left, right=right)

        return left

    def _parse_unary(self) -> ASTNode:
        """Parse unary expressions."""
        token = self._current()
        if token.type == TokenType.OPERATOR and token.value in ("!", "-", "+"):
            operator = self._advance().value
            argument = self._parse_unary()
            return UnaryExpressionNode(operator=operator, argument=argument)
        return self._parse_call_member()

    def _parse_call_member(self) -> ASTNode:
        """Parse call and member expressions."""
        node = self._parse_primary()

        while True:
            token = self._current()

            if token.type == TokenType.DOT:
                self._advance()
                prop_token = self._expect(TokenType.IDENTIFIER)
                node = MemberExpressionNode(
                    object=node,
                    property=IdentifierNode(name=prop_token.value),
                    computed=False,
                )
            elif token.type == TokenType.BRACKET_OPEN:
                self._advance()
                property_expr = self._parse_expression()
                self._expect(TokenType.BRACKET_CLOSE)
                node = MemberExpressionNode(
                    object=node,
                    property=property_expr,
                    computed=True,
                )
            elif token.type == TokenType.PAREN_OPEN:
                self._advance()
                arguments = self._parse_arguments()
                self._expect(TokenType.PAREN_CLOSE)
                node = CallExpressionNode(callee=node, arguments=arguments)
            else:
                break

        return node

    def _parse_arguments(self) -> list[ASTNode]:
        """Parse function call arguments."""
        args: list[ASTNode] = []

        if self._current().type == TokenType.PAREN_CLOSE:
            return args

        args.append(self._parse_expression())

        while self._current().type == TokenType.COMMA:
            self._advance()
            args.append(self._parse_expression())

        return args

    def _parse_primary(self) -> ASTNode:
        """Parse primary expressions (literals, identifiers, grouped)."""
        token = self._current()

        if token.type == TokenType.NUMBER:
            self._advance()
            return LiteralNode(value=token.value)

        if token.type == TokenType.STRING:
            self._advance()
            return LiteralNode(value=token.value)

        if token.type == TokenType.BOOLEAN:
            self._advance()
            return LiteralNode(value=token.value)

        if token.type == TokenType.NULL:
            self._advance()
            return LiteralNode(value=None)

        if token.type == TokenType.IDENTIFIER:
            self._advance()
            return IdentifierNode(name=token.value)

        if token.type == TokenType.PAREN_OPEN:
            self._advance()
            expr = self._parse_expression()
            self._expect(TokenType.PAREN_CLOSE)
            return expr

        if token.type == TokenType.BRACKET_OPEN:
            return self._parse_array()

        if token.type == TokenType.BRACE_OPEN:
            return self._parse_object()

        raise ParseError(f"Unexpected token {token.type.value}: {token.value}")

    def _parse_array(self) -> ArrayExpressionNode:
        """Parse an array literal."""
        self._expect(TokenType.BRACKET_OPEN)
        elements: list[ASTNode] = []

        if self._current().type != TokenType.BRACKET_CLOSE:
            elements.append(self._parse_expression())

            while self._current().type == TokenType.COMMA:
                self._advance()
                if self._current().type == TokenType.BRACKET_CLOSE:
                    break  # Trailing comma
                elements.append(self._parse_expression())

        self._expect(TokenType.BRACKET_CLOSE)
        return ArrayExpressionNode(elements=elements)

    def _parse_object(self) -> ObjectExpressionNode:
        """Parse an object literal."""
        self._expect(TokenType.BRACE_OPEN)
        properties: list[tuple[str, ASTNode]] = []

        if self._current().type != TokenType.BRACE_CLOSE:
            properties.append(self._parse_property())

            while self._current().type == TokenType.COMMA:
                self._advance()
                if self._current().type == TokenType.BRACE_CLOSE:
                    break  # Trailing comma
                properties.append(self._parse_property())

        self._expect(TokenType.BRACE_CLOSE)
        return ObjectExpressionNode(properties=properties)

    def _parse_property(self) -> tuple[str, ASTNode]:
        """Parse an object property."""
        token = self._current()

        if token.type == TokenType.IDENTIFIER:
            key = self._advance().value
        elif token.type == TokenType.STRING:
            key = self._advance().value
        else:
            raise ParseError(f"Expected property key, got {token.type.value}")

        self._expect(TokenType.COLON)
        value = self._parse_expression()
        return (key, value)


class ExpressionEvaluator:
    """Evaluates expression AST against a scope."""

    def __init__(self, scope: "Scope", filter_registry: "FilterRegistry") -> None:
        self.scope = scope
        self.filter_registry = filter_registry

    def evaluate(self, expression: str) -> Any:
        """Parse and evaluate an expression string.

        Args:
            expression: The expression to evaluate

        Returns:
            The evaluated result
        """
        expression = expression.strip()
        if not expression:
            return ""

        try:
            lexer = ExpressionLexer(expression)
            tokens = lexer.tokenize()
            parser = ExpressionParser(tokens)
            ast = parser.parse()
            return self._evaluate_node(ast)
        except (LexerError, ParseError) as e:
            raise EvaluationError(f'Failed to parse expression "{expression}": {e}') from e

    def _evaluate_node(self, node: ASTNode) -> Any:
        """Evaluate an AST node.

        Args:
            node: The AST node to evaluate

        Returns:
            The evaluated result
        """
        if isinstance(node, LiteralNode):
            return node.value

        if isinstance(node, IdentifierNode):
            return self._resolve_identifier(node.name)

        if isinstance(node, MemberExpressionNode):
            return self._evaluate_member(node)

        if isinstance(node, CallExpressionNode):
            return self._evaluate_call(node)

        if isinstance(node, BinaryExpressionNode):
            return self._evaluate_binary(node)

        if isinstance(node, UnaryExpressionNode):
            return self._evaluate_unary(node)

        if isinstance(node, ArrayExpressionNode):
            return [self._evaluate_node(elem) for elem in node.elements]

        if isinstance(node, ObjectExpressionNode):
            return {key: self._evaluate_node(value) for key, value in node.properties}

        raise EvaluationError(f"Unknown node type: {type(node).__name__}")

    def _resolve_identifier(self, name: str) -> Any:
        """Resolve an identifier from scope."""
        value = self.scope.get(name)
        return value

    def _evaluate_member(self, node: MemberExpressionNode) -> Any:
        """Evaluate a member expression."""
        obj = self._evaluate_node(node.object)

        if obj is None:
            return ""

        if node.computed:
            prop = self._evaluate_node(node.property)
        else:
            if isinstance(node.property, IdentifierNode):
                prop = node.property.name
            else:
                raise EvaluationError("Non-computed member access requires identifier")

        # Security: Block access to dunder attributes to prevent sandbox escape
        if isinstance(prop, str) and (prop.startswith("__") or prop.startswith("_")):
            raise EvaluationError(f"Access to private attribute '{prop}' is not allowed")

        # Handle dict access
        if isinstance(obj, dict):
            result = obj.get(prop)
            return "" if result is None else result

        # Handle list access
        if isinstance(obj, list):
            if isinstance(prop, int) and 0 <= prop < len(obj):
                return obj[prop]
            return ""

        # Handle object attribute access
        if hasattr(obj, prop):
            result = getattr(obj, prop)
            return "" if result is None else result

        return ""

    def _evaluate_call(self, node: CallExpressionNode) -> Any:
        """Evaluate a function call."""
        if not isinstance(node.callee, IdentifierNode):
            raise EvaluationError("Only calls to registered filters are allowed.")

        function_name = node.callee.name
        filter_func = self.filter_registry.get(function_name)

        if filter_func is None:
            raise EvaluationError(f'Filter "{function_name}" is not registered.')

        args = [self._evaluate_node(arg) for arg in node.arguments]

        if len(args) == 0:
            raise EvaluationError(f'Filter "{function_name}" requires at least one argument.')

        input_value = args[0]
        rest_args = args[1:]

        return filter_func(input_value, *rest_args)

    def _evaluate_binary(self, node: BinaryExpressionNode) -> Any:
        """Evaluate a binary expression."""
        # Short-circuit evaluation for && and ||
        left = self._evaluate_node(node.left)

        if node.operator == "&&":
            if not left:
                return left
            return self._evaluate_node(node.right)

        if node.operator == "||":
            if left:
                return left
            return self._evaluate_node(node.right)

        right = self._evaluate_node(node.right)

        match node.operator:
            case "+":
                return left + right
            case "-":
                return left - right
            case "*":
                return left * right
            case "/":
                if right == 0:
                    raise EvaluationError("Division by zero")
                return left / right
            case "%":
                if right == 0:
                    raise EvaluationError("Modulo by zero")
                return left % right
            case "==" | "===":
                return left == right
            case "!=" | "!==":
                return left != right
            case ">":
                return left > right
            case ">=":
                return left >= right
            case "<":
                return left < right
            case "<=":
                return left <= right
            case _:
                raise EvaluationError(f'Operator "{node.operator}" is not allowed.')

    def _evaluate_unary(self, node: UnaryExpressionNode) -> Any:
        """Evaluate a unary expression."""
        argument = self._evaluate_node(node.argument)

        match node.operator:
            case "!":
                return not argument
            case "-":
                return -argument
            case "+":
                return +argument
            case _:
                raise EvaluationError(f'Unary operator "{node.operator}" is not supported.')
