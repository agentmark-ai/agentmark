# @agentmark-ai/mcp-server

MCP (Model Context Protocol) server for [AgentMark](https://github.com/agentmark-ai/agentmark). Exposes the full AgentMark API to AI editors like Claude Code and Cursor: list traces and drill into spans, append dataset rows, write scores, run experiments, manage apps, deployments, environments, alerts, and annotation queues.

## How it works

The server doesn't ship a fixed, hand-written tool list. On startup it reads the gateway's OpenAPI contract from `<AGENTMARK_API_URL>/v1/openapi.json` and registers **one MCP tool per endpoint** — tool names are the spec's operationIds in snake_case (`list_traces`, `get_trace`, `create_score`, `append_dataset_row`, `create_app`, ...). The tool surface always matches what the gateway actually accepts.

Both the local `agentmark dev` server and the Cloud gateway serve the same OpenAPI contract, so the same binary works against either — only the configured URL differs.

## Usage

Run it with `npx`; there's nothing to install. `npm create agentmark@latest` wires this up for you (as the `agentmark` and `agentmark-local` entries); the configs below are the manual equivalent.

### Local dev server (Claude Code, Cursor, etc.)

Point at your running `agentmark dev` server. Add to `.mcp.json` (Claude Code), `.cursor/mcp.json` (Cursor), or your editor's MCP config:

```json
{
  "mcpServers": {
    "agentmark-local": {
      "command": "npx",
      "args": ["-y", "@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_API_URL": "http://localhost:9418"
      }
    }
  }
}
```

Local calls are unauthenticated — no key needed.

### AgentMark Cloud

After `agentmark login`, no key is needed: the server resolves your session from `~/.agentmark/auth.json` and refreshes it automatically. For CI or agents without a login session, supply an API key (it takes precedence over the session):

```json
{
  "mcpServers": {
    "agentmark": {
      "command": "npx",
      "args": ["-y", "@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AGENTMARK_API_URL` | `https://api.agentmark.co` | Gateway URL; set to `http://localhost:9418` for the local dev server |
| `AGENTMARK_API_KEY` | - | API key for Cloud authentication (optional after `agentmark login`; local dev is unauthenticated) |
| `AGENTMARK_TIMEOUT_MS` | `30000` | Per-request timeout in milliseconds |

## Requirements

For local development:

1. The AgentMark CLI installed and running (`agentmark dev`)
2. Traces recorded in your local AgentMark database

## Programmatic Usage

```typescript
import { createMCPServer, runServer } from '@agentmark-ai/mcp-server';

// Run the server with stdio transport
await runServer();

// Or create a server instance for custom transport
const server = await createMCPServer();
```

## Documentation

Full reference at [docs.agentmark.co/reference/mcp-servers](https://docs.agentmark.co/reference/mcp-servers).

## License

[AGPL-3.0-or-later](../../LICENSE.md)
