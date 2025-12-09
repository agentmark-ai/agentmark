# AgentMark Pydantic AI Adapter

Pydantic AI adapter for AgentMark - integrate AgentMark prompts with Pydantic AI for type-safe LLM interactions in Python.

## Installation

```bash
pip install agentmark-pydantic-ai
```

For specific providers, install with extras:

```bash
pip install agentmark-pydantic-ai[openai]
pip install agentmark-pydantic-ai[anthropic]
pip install agentmark-pydantic-ai[gemini]
```

## Quick Start

```python
from agentmark_pydantic_ai import create_pydantic_ai_client, run_text_prompt

# Create client
client = create_pydantic_ai_client()

# Load and format a prompt
prompt = await client.load_text_prompt(ast)  # AST from AgentMark compiler
params = await prompt.format(props={"name": "Alice"})

# Execute with runner utility
result = await run_text_prompt(params)
print(result.output)

# Or use Pydantic AI directly
from pydantic_ai import Agent

agent = Agent(params.model, system_prompt=params.system_prompt)
result = await agent.run(params.user_prompt)
print(result.output)
```

## Features

- **Type-safe integration**: Full type safety from AgentMark prompts to Pydantic AI
- **Model registry**: Flexible model name resolution with pattern matching
- **Tool registry**: Register tool execution functions for AgentMark-defined tools
- **Structured output**: Automatic JSON Schema to Pydantic model conversion
- **Runner utilities**: Convenience functions for common execution patterns

## API Reference

### Factory Function

```python
from agentmark_pydantic_ai import create_pydantic_ai_client

client = create_pydantic_ai_client(
    model_registry=None,      # Optional custom model registry
    tool_registry=None,       # Optional tool registry
    eval_registry=None,       # Optional eval registry
    loader=None,              # Optional prompt loader
)
```

### Model Registry

```python
from agentmark_pydantic_ai import PydanticAIModelRegistry, create_default_model_registry
import re

# Use default registry (handles common model prefixes)
registry = create_default_model_registry()

# Or create custom registry
registry = PydanticAIModelRegistry()
registry.register_models("gpt-4o", lambda name, opts: f"openai:{name}")
registry.register_models(
    re.compile(r"^claude-"),
    lambda name, opts: f"anthropic:{name}"
)
```

### Tool Registry

```python
from agentmark_pydantic_ai import PydanticAIToolRegistry

registry = PydanticAIToolRegistry()

# Register sync tool
registry.register("search", lambda args, ctx: search_web(args["query"]))

# Register async tool
async def fetch_data(args, ctx):
    return await api.get(args["url"])
registry.register("fetch", fetch_data)
```

### Runner Utilities

```python
from agentmark_pydantic_ai import run_text_prompt, run_object_prompt, stream_text_prompt

# Run text prompt
result = await run_text_prompt(params)
print(result.output)       # str
print(result.usage)        # Usage stats

# Run object prompt (structured output)
result = await run_object_prompt(params)
print(result.output)       # Typed Pydantic model

# Stream text prompt
async for chunk in stream_text_prompt(params):
    print(chunk, end="", flush=True)
```

## License

MIT
