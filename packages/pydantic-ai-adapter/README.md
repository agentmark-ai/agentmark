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
- **MCP support**: Model Context Protocol integration for external tool servers
- **Structured output**: Automatic JSON Schema to Pydantic model conversion
- **Runner utilities**: Convenience functions for common execution patterns

## API Reference

### Factory Function

```python
from agentmark_pydantic_ai import create_pydantic_ai_client

client = create_pydantic_ai_client(
    model_registry=None,      # Optional custom model registry
    tool_registry=None,       # Optional tool registry
    mcp_registry=None,        # Optional MCP server registry
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

### MCP Server Registry

```python
from agentmark_pydantic_ai import McpServerRegistry

registry = McpServerRegistry()

# Register HTTP-based MCP server
registry.register("search-server", {
    "url": "http://localhost:8000/mcp",
    "headers": {"Authorization": "Bearer token"},  # Optional
})

# Register stdio-based MCP server
registry.register("python-runner", {
    "command": "python",
    "args": ["-m", "mcp_server"],
    "cwd": "/app",
    "env": {"API_KEY": "secret"},
})

# Use with client
client = create_pydantic_ai_client(mcp_registry=registry)
```

Then in your AgentMark prompt, reference MCP tools:

```yaml
tools:
  search: mcp://search-server/web-search    # Single tool
  all_tools: mcp://search-server/*          # All tools from server
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

### Webhook Handler

For building HTTP servers that execute AgentMark prompts (used by the CLI dev server):

```python
from agentmark_pydantic_ai import create_pydantic_ai_client, PydanticAIWebhookHandler

# Create client and handler
client = create_pydantic_ai_client()
handler = PydanticAIWebhookHandler(client)

# Execute a prompt (non-streaming)
result = await handler.run_prompt(prompt_ast, {"shouldStream": False})
print(result["result"])  # "Hello, world!"

# Execute a prompt (streaming)
result = await handler.run_prompt(prompt_ast, {"shouldStream": True})
async for chunk in result["stream"]:
    print(chunk)  # NDJSON chunks
```

The webhook handler implements the AgentMark webhook protocol, producing NDJSON responses compatible with the CLI.

## License

MIT
