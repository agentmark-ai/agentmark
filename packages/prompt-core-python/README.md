# AgentMark Prompt Core (Python)

Python implementation of the AgentMark prompt-core package. This package provides the high-level runtime for working with AgentMark prompts.

## Installation

```bash
pip install agentmark-prompt-core
```

## Usage

This package transforms pre-parsed MDX AST trees. The AST is typically obtained by:
- Parsing MDX with the TypeScript `@agentmark-ai/templatedx` package
- Loading a pre-parsed AST from a JSON file
- Receiving an AST from the AgentMark runtime

```python
import asyncio
import json
from agentmark.prompt_core import create_agentmark, DefaultAdapter

async def main():
    # Create an AgentMark instance with the default adapter
    agentmark = create_agentmark(adapter=DefaultAdapter())

    # Load a pre-parsed MDX AST (from TypeScript parser or JSON file)
    with open("math.prompt.mdx.json") as f:
        ast = json.load(f)

    # Load and format a text prompt
    prompt = await agentmark.load_text_prompt(ast)
    result = await prompt.format(props={"userMessage": "What is 2+2?"})

    print(result)

asyncio.run(main())
```

## Features

- **Prompt Types**: Text, Object, Image, and Speech prompts
- **Message Extraction**: System, User, and Assistant message roles
- **Attachments**: Image and file attachments in User messages
- **Schema Validation**: Pydantic-based validation matching TypeScript Zod schemas
- **Adapters**: Extensible adapter interface for different LLM providers
- **Eval Registry**: Registry for evaluation functions

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run tests
pytest

# Run linting
ruff check src tests

# Run type checking
mypy src/agentmark --strict
```

## License

MIT
