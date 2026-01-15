# Quickstart: MCP Trace Server

**Feature**: 003-mcp-trace-server
**Date**: 2026-01-08

## Overview

The AgentMark MCP Trace Server enables AI agents (Claude Code, Cursor, etc.) to search and analyze trace data for debugging. This guide covers setup, configuration, and basic usage.

## Prerequisites

- Node.js 18+ (ESM support required)
- AgentMark CLI installed and running (`agentmark dev`)
- An MCP-compatible AI agent (Claude Code, Cursor, etc.)

## Installation

### Via agentmark init (Recommended)

```bash
# Initialize a new AgentMark project
npx create-agentmark@latest my-project
cd my-project

# MCP server is automatically configured
```

### Manual Installation

```bash
npm install @agentmark-ai/mcp-server
```

## Configuration

The MCP server uses two environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTMARK_URL` | Yes | Data source URL (local or cloud) |
| `AGENTMARK_API_KEY` | No | API key for authentication (cloud only) |

### Local Setup (Claude Code / Cursor)

Add to your MCP configuration:

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

### Cloud Setup

Get your API key from the AM Cloud dashboard, then configure:

```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "https://api.agentmark.ai",
        "AGENTMARK_API_KEY": "am_your_api_key_here"
      }
    }
  }
}
```

### Shell Environment (alternative)

```bash
export AGENTMARK_URL="http://localhost:9418"
# For cloud: also set AGENTMARK_API_KEY
```

## Running the Server

### Standalone

```bash
# Run the MCP server
npx @agentmark-ai/mcp-server

# Or if installed locally
npx agentmark-mcp
```

### With AgentMark Dev Server

```bash
# Start the AgentMark dev server (required for local traces)
agentmark dev

# In another terminal, the MCP server connects automatically
```

## Basic Usage

Once connected, your AI agent has access to four tools:

### 1. List Recent Traces

```
list_traces(limit: 10)
```

Returns the 10 most recent traces with summary info.

### 2. Search Traces

```
search_traces(filters: [
  { field: "status", operator: "eq", value: "error" }
])
```

Find all traces with errors.

### 3. Get Trace Details

```
get_trace(traceId: "trace-abc123")
```

Get full details including all spans for a specific trace.

### 4. Search Spans

```
search_spans(filters: [
  { field: "data.metadata.user_id", operator: "eq", value: "user-123" }
])
```

Find spans by custom attributes.

## Example Debugging Session

### Scenario: Debug a slow LLM call

1. **Find recent error traces:**
   ```
   AI: I'll search for recent traces with errors.
   [calls search_traces with status=error filter]
   ```

2. **Get trace details:**
   ```
   AI: Found trace-abc123. Let me get the full details.
   [calls get_trace with traceId]
   ```

3. **Analyze spans:**
   ```
   AI: I can see the trace has 5 spans. The third span
   (GENERATION type, claude-3-opus model) took 8.5 seconds.
   Looking at the input, the prompt was 15,000 tokens.
   ```

4. **Find similar patterns:**
   ```
   AI: Let me search for other slow generations.
   [calls search_spans with latency > 5000 filter]
   ```

## Filter Examples

### Find traces by status
```json
{ "field": "status", "operator": "eq", "value": "error" }
```

### Find slow traces (> 5 seconds)
```json
{ "field": "latency", "operator": "gt", "value": 5000 }
```

### Find traces by name pattern
```json
{ "field": "name", "operator": "contains", "value": "summarize" }
```

### Find spans by model
```json
{ "field": "data.model", "operator": "contains", "value": "claude" }
```

### Find spans by custom attribute
```json
{ "field": "data.metadata.user_id", "operator": "eq", "value": "user-123" }
```

### Combine multiple filters (AND)
```json
[
  { "field": "status", "operator": "eq", "value": "error" },
  { "field": "latency", "operator": "gt", "value": 1000 }
]
```

## Pagination

For large result sets, use cursor-based pagination:

```
# First page
search_traces(limit: 20)
→ { items: [...], cursor: "abc123", hasMore: true }

# Next page
search_traces(limit: 20, cursor: "abc123")
→ { items: [...], cursor: "def456", hasMore: true }

# Continue until hasMore is false
```

## Troubleshooting

### "Connection failed" error

1. Ensure AgentMark dev server is running:
   ```bash
   agentmark dev
   ```

2. Check `AGENTMARK_URL` is correct and reachable:
   ```bash
   curl $AGENTMARK_URL/health
   # or for default local:
   curl http://localhost:9418/health
   ```

### "Trace not found" error

The trace ID may be invalid or the trace hasn't been synced yet. Wait a moment and retry, or use `list_traces` to find valid trace IDs.

### Slow searches

- Reduce the `limit` parameter
- Add more specific filters
- Use cursor pagination for large results

## Next Steps

- [MCP Tool Reference](./contracts/mcp-tools.md) - Detailed tool schemas
- [Data Model](./data-model.md) - Entity definitions and relationships
- [Research](./research.md) - Architecture decisions
