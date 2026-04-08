# AgentMark Claude Agent SDK Adapter

Python adapter for integrating AgentMark prompts with Claude Agent SDK.

## Installation

```bash
pip install agentmark-claude-agent-sdk
```

## Usage

```python
from agentmark_claude_agent_sdk import (
    create_claude_agent_client,
    ClaudeAgentModelRegistry,
    ClaudeAgentAdapterOptions,
)

# Create a client with default settings
client = create_claude_agent_client()

# Or with custom configuration
client = create_claude_agent_client(
    model_registry=ClaudeAgentModelRegistry.create_default(),
    adapter_options=ClaudeAgentAdapterOptions(
        permission_mode="bypassPermissions",
        max_turns=10,
    ),
)

# Load and format a prompt
prompt = await client.load_text_prompt(ast)
adapted = await prompt.format(props={"task": "Help me write code"})

# Execute with Claude Agent SDK
from claude_agent_sdk import query

async for message in query(prompt=adapted.query.prompt, options=...):
    print(message)
```

## Features

- Full integration with AgentMark prompt framework
- Model registry for custom model configurations
- Tool registry for custom tool definitions
- MCP server bridging for tool execution
- OpenTelemetry tracing support
- Webhook handler for HTTP-based prompt execution

## License

MIT
