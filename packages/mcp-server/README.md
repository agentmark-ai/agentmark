# @agentmark-ai/mcp-server

MCP (Model Context Protocol) server for AgentMark trace debugging. This server enables AI assistants to query and analyze traces from your AgentMark applications.

## Installation

```bash
npm install @agentmark-ai/mcp-server
# or
yarn add @agentmark-ai/mcp-server
```

## Usage

### As a CLI tool

Run the MCP server directly:

```bash
npx @agentmark-ai/mcp-server
```

### With Claude Code

Add to your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "http://localhost:9418"
      }
    }
  }
}
```

### With Cursor

Add to your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "http://localhost:9418"
      }
    }
  }
}
```

### With Claude Desktop

Add to your Claude Desktop configuration (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "http://localhost:9418"
      }
    }
  }
}
```

### Cloud Configuration

For AM Cloud integration, add your API key:

```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "https://api.agentmark.ai",
        "AGENTMARK_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Requirements

For local development, this MCP server connects to the AgentMark CLI local API server:

1. The AgentMark CLI installed and running (`agentmark dev`)
2. Traces recorded in your local AgentMark database

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `AGENTMARK_URL` | `http://localhost:9418` | URL of the AgentMark API server |
| `AGENTMARK_API_KEY` | - | API key for authentication (required for cloud) |
| `AGENTMARK_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |

## Available Tools

### `list_traces`

List recent traces with metadata including IDs, names, status, latency, cost, and token counts.

**Parameters:**
- `limit` (optional): Maximum traces to return (default: 50, max: 200)
- `sessionId` (optional): Filter by session ID
- `datasetRunId` (optional): Filter by dataset run ID

**Returns:**
```json
{
  "items": [...],
  "total": 42,
  "hasMore": false
}
```

### `get_trace`

Get trace summary including status, latency, cost, and token counts. Use this to understand overall trace health before drilling into spans.

**Parameters:**
- `traceId` (required): The trace ID to retrieve

**Returns:**
```json
{
  "trace": {
    "id": "trace-123",
    "name": "my-trace",
    "spans": [...],
    "data": {
      "status": "0",
      "latency": 1234,
      "cost": 0.05,
      "tokens": 500
    }
  }
}
```

### `get_spans`

Get spans with filtering and pagination. Provide `traceId` to scope to one trace, or omit for cross-trace search. Use filters to find specific spans (errors, slow operations, specific types).

**Parameters:**
- `traceId` (optional): Scope to a specific trace. Omit for cross-trace search.
- `filters` (optional): Array of filter objects with `field`, `operator`, and `value`
- `limit` (optional): Results per page (default: 50, max: 200)
- `cursor` (optional): Pagination cursor from previous response

**Supported Filters:**

| Field | Operators | Description |
|-------|-----------|-------------|
| `status` | `eq` | Span status ("0"=ok, "1"=warning, "2"=error) |
| `duration` | `gt`, `gte`, `lt`, `lte` | Span duration in milliseconds |
| `name` | `contains` | Span name substring match |
| `data.type` | `eq` | Span type ("GENERATION", "SPAN", "EVENT") |
| `data.model` | `contains` | Model name substring match |

**Note:** Duration filters use `>=` for `gt`/`gte` and `<=` for `lt`/`lte` at the database level.

**Example - Find error spans:**
```json
{
  "filters": [
    { "field": "status", "operator": "eq", "value": "2" }
  ]
}
```

**Example - Find slow LLM generations:**
```json
{
  "filters": [
    { "field": "data.type", "operator": "eq", "value": "GENERATION" },
    { "field": "duration", "operator": "gt", "value": 5000 }
  ]
}
```

**Example - Cross-trace search for Claude models:**
```json
{
  "filters": [
    { "field": "data.model", "operator": "contains", "value": "claude" }
  ]
}
```

**Returns:**
```json
{
  "items": [...],
  "cursor": "eyJvZmZzZXQiOjUwfQ==",
  "hasMore": true
}
```

## Error Handling

All tools return structured errors with codes:

```json
{
  "error": "Trace not found: trace-123",
  "code": "NOT_FOUND",
  "details": { "traceId": "trace-123" }
}
```

**Error Codes:**
- `CONNECTION_FAILED` - Cannot reach data source
- `INVALID_QUERY` - Malformed filter or unsupported field/operator combination
- `NOT_FOUND` - Resource doesn't exist
- `TIMEOUT` - Request exceeded time limit

## Programmatic Usage

```typescript
import { createMCPServer, runServer } from '@agentmark-ai/mcp-server';

// Run the server with stdio transport
await runServer();

// Or create a server instance for custom transport
const server = await createMCPServer();
```

## License

MIT
