# AgentMark TemplateDX (Python)

Python implementation of the AgentMark templatedx transformer.

## Installation

```bash
pip install agentmark-templatedx
```

## Usage

This package transforms pre-parsed MDX AST trees. The AST is typically obtained by:
- Parsing MDX with the TypeScript `@agentmark-ai/templatedx` package
- Loading a pre-parsed AST from a JSON file
- Receiving an AST from the AgentMark runtime

```python
import asyncio
import json
from templatedx import TemplateDX

async def main():
    engine = TemplateDX()

    # Load a pre-parsed MDX AST (from TypeScript parser or JSON file)
    with open("template.ast.json") as f:
        ast = json.load(f)

    # Transform the AST with props
    result = await engine.transform(
        ast,
        props={"name": "Alice", "items": [1, 2, 3]}
    )

    print(result)

asyncio.run(main())
```

## Custom Plugins

```python
from templatedx import TagPlugin, PluginContext

class MyPlugin(TagPlugin):
    async def transform(self, props, children, context):
        # Transform children and return result
        transformer = context.create_node_transformer(context.scope)
        return await transformer.transform_children(children)

engine = TemplateDX()
engine.register_tag_plugin(MyPlugin(), ["MyTag"])
```

## Custom Filters

```python
engine = TemplateDX()
engine.register_filter("double", lambda x: x * 2)
```

## Built-in Filters

- `capitalize(str)` - Capitalize first character
- `upper(str)` - Uppercase string
- `lower(str)` - Lowercase string
- `truncate(str, length)` - Truncate with ellipsis
- `abs(num)` - Absolute value
- `join(arr, separator)` - Join array elements
- `round(num, decimals)` - Round number
- `replace(str, search, replacement)` - Replace occurrences
- `urlencode(str)` - URL encode string
- `dump(any)` - JSON stringify

## Built-in Tags

- `<If condition={...}>` / `<ElseIf condition={...}>` / `<Else>` - Conditional rendering
- `<ForEach arr={...}>{(item, index) => ...}</ForEach>` - Array iteration
- `<Raw>...</Raw>` - Raw content passthrough
