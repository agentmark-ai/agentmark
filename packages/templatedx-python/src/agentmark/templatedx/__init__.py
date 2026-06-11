"""``agentmark.templatedx`` — namespace alias for :mod:`templatedx`.

The AgentMark Python packages are converging on the ``agentmark.*`` namespace
(``agentmark.prompt_core`` already lives there; the bare ``templatedx`` name
is also generic enough to collide). Explicit re-exports (kept in sync with
``templatedx.__all__``) so both import paths work; new code should prefer
``from agentmark.templatedx import ...``. The flat name remains supported.
"""

from templatedx import (
    MDX_JSX_ATTRIBUTE_TYPES,
    NODE_TYPES,
    EvaluationError,
    ExpressionEvaluator,
    FilterRegistry,
    LexerError,
    Node,
    NodeHelpers,
    NodeTransformer,
    ParseError,
    PluginContext,
    Scope,
    TagPlugin,
    TagPluginRegistry,
    TemplateDX,
    TemplateDXError,
    transform_tree,
)

__all__ = [
    "MDX_JSX_ATTRIBUTE_TYPES",
    "NODE_TYPES",
    "EvaluationError",
    "ExpressionEvaluator",
    "FilterRegistry",
    "LexerError",
    "Node",
    "NodeHelpers",
    "NodeTransformer",
    "ParseError",
    "PluginContext",
    "Scope",
    "TagPlugin",
    "TagPluginRegistry",
    "TemplateDX",
    "TemplateDXError",
    "transform_tree",
]
