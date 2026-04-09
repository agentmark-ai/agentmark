"""TemplateDX - Python implementation of the AgentMark templatedx transformer.

This package provides a Python implementation of the templatedx transformer
for processing AgentMark MDX AST trees.

Example:
    ```python
    import asyncio
    from templatedx import TemplateDX

    async def main():
        engine = TemplateDX()
        result = await engine.transform(
            ast,
            props={"name": "Alice"}
        )
        print(result)

    asyncio.run(main())
    ```
"""

from importlib.metadata import version as _pkg_version

from .constants import MDX_JSX_ATTRIBUTE_TYPES, NODE_TYPES
from .engine import TemplateDX
from .expression import EvaluationError, ExpressionEvaluator, LexerError, ParseError
from .filter_registry import FilterRegistry
from .scope import Scope
from .tag_plugin import Node, NodeHelpers, PluginContext, TagPlugin
from .tag_registry import TagPluginRegistry
from .transformer import NodeTransformer, transform_tree

# Read runtime __version__ from installed dist metadata to prevent drift
# against pyproject.toml across releases. See pydantic-ai-v0-adapter for
# the same pattern and rationale.
__version__ = _pkg_version("agentmark-templatedx")

__all__ = [
    # Main engine
    "TemplateDX",
    # Core classes
    "NodeTransformer",
    "Scope",
    "TagPlugin",
    "PluginContext",
    "NodeHelpers",
    # Registries
    "TagPluginRegistry",
    "FilterRegistry",
    # Expression evaluation
    "ExpressionEvaluator",
    "LexerError",
    "ParseError",
    "EvaluationError",
    # Constants
    "NODE_TYPES",
    "MDX_JSX_ATTRIBUTE_TYPES",
    # Types
    "Node",
    # Convenience functions
    "transform_tree",
]
