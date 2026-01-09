# MCP Tool Contracts: Trace Server

**Feature**: 003-mcp-trace-server
**Date**: 2026-01-08
**Protocol**: Model Context Protocol (MCP)

## Overview

Four MCP tools exposed by the AgentMark Trace Server:

| Tool | Purpose | Priority |
|------|---------|----------|
| `list_traces` | Browse recent traces with filters | P1 |
| `search_traces` | Search traces by any attribute | P1 |
| `get_trace` | Retrieve full trace details | P1 |
| `search_spans` | Search spans by custom attributes | P1 |

---

## Tool: `list_traces`

**Description**: List recent traces with optional filtering by session or dataset run.

### Input Schema (Zod)

```typescript
const ListTracesInput = z.object({
  limit: z.number().min(1).max(200).optional().default(50)
    .describe('Maximum number of traces to return'),
  sessionId: z.string().optional()
    .describe('Filter traces by session ID'),
  datasetRunId: z.string().optional()
    .describe('Filter traces by dataset run ID'),
});
```

### Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "number",
      "minimum": 1,
      "maximum": 200,
      "default": 50,
      "description": "Maximum number of traces to return"
    },
    "sessionId": {
      "type": "string",
      "description": "Filter traces by session ID"
    },
    "datasetRunId": {
      "type": "string",
      "description": "Filter traces by dataset run ID"
    }
  },
  "additionalProperties": false
}
```

### Output

```typescript
interface ListTracesOutput {
  traces: TraceListItem[];
  count: number;
}
```

### Example

**Request**:
```json
{
  "limit": 10,
  "sessionId": "session-abc123"
}
```

**Response**:
```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"traces\": [\n    {\n      \"id\": \"trace-001\",\n      \"name\": \"generate-summary\",\n      \"status\": \"success\",\n      \"latency\": 1234,\n      \"totalTokens\": 500,\n      \"createdAt\": \"2026-01-08T10:00:00Z\"\n    }\n  ],\n  \"count\": 1\n}"
  }]
}
```

---

## Tool: `search_traces`

**Description**: Search for traces using attribute filters with AND logic. Supports comparison operators for numeric fields.

### Input Schema (Zod)

```typescript
const SearchFilter = z.object({
  field: z.string().describe('Attribute path to filter (e.g., "status", "data.model")'),
  operator: z.enum(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains'])
    .describe('Comparison operator'),
  value: z.union([z.string(), z.number(), z.boolean()])
    .describe('Value to compare against'),
});

const SearchTracesInput = z.object({
  filters: z.array(SearchFilter).optional().default([])
    .describe('Filter criteria (combined with AND)'),
  limit: z.number().min(1).max(200).optional().default(50)
    .describe('Results per page'),
  cursor: z.string().optional()
    .describe('Pagination cursor from previous response'),
  sortBy: z.string().optional().default('createdAt')
    .describe('Field to sort by'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
    .describe('Sort direction'),
});
```

### Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "filters": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": {
            "type": "string",
            "description": "Attribute path to filter (e.g., 'status', 'data.model')"
          },
          "operator": {
            "type": "string",
            "enum": ["eq", "ne", "gt", "gte", "lt", "lte", "contains"],
            "description": "Comparison operator"
          },
          "value": {
            "oneOf": [
              { "type": "string" },
              { "type": "number" },
              { "type": "boolean" }
            ],
            "description": "Value to compare against"
          }
        },
        "required": ["field", "operator", "value"]
      },
      "default": [],
      "description": "Filter criteria (combined with AND)"
    },
    "limit": {
      "type": "number",
      "minimum": 1,
      "maximum": 200,
      "default": 50,
      "description": "Results per page"
    },
    "cursor": {
      "type": "string",
      "description": "Pagination cursor from previous response"
    },
    "sortBy": {
      "type": "string",
      "default": "createdAt",
      "description": "Field to sort by"
    },
    "sortOrder": {
      "type": "string",
      "enum": ["asc", "desc"],
      "default": "desc",
      "description": "Sort direction"
    }
  },
  "additionalProperties": false
}
```

### Output

```typescript
interface SearchTracesOutput {
  items: TraceListItem[];
  total?: number;        // Omitted if > 10,000
  cursor?: string;       // Next page cursor
  hasMore: boolean;
}
```

### Examples

**Example 1: Find error traces**
```json
{
  "filters": [
    { "field": "status", "operator": "eq", "value": "error" }
  ],
  "limit": 20
}
```

**Example 2: Find slow traces (> 5 seconds)**
```json
{
  "filters": [
    { "field": "latency", "operator": "gt", "value": 5000 }
  ],
  "sortBy": "latency",
  "sortOrder": "desc"
}
```

**Example 3: Combined filters**
```json
{
  "filters": [
    { "field": "status", "operator": "eq", "value": "error" },
    { "field": "latency", "operator": "gt", "value": 1000 },
    { "field": "name", "operator": "contains", "value": "summarize" }
  ],
  "limit": 10
}
```

**Response**:
```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"items\": [...],\n  \"total\": 42,\n  \"cursor\": \"eyJvZmZzZXQiOjEwfQ==\",\n  \"hasMore\": true\n}"
  }]
}
```

---

## Tool: `get_trace`

**Description**: Retrieve complete details of a specific trace including all spans and their relationships.

### Input Schema (Zod)

```typescript
const GetTraceInput = z.object({
  traceId: z.string().min(1).describe('The trace ID to retrieve'),
});
```

### Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "traceId": {
      "type": "string",
      "minLength": 1,
      "description": "The trace ID to retrieve"
    }
  },
  "required": ["traceId"],
  "additionalProperties": false
}
```

### Output

```typescript
// Success
interface GetTraceOutput {
  trace: TraceData;  // Includes spans array
}

// Not found
interface GetTraceNotFound {
  error: string;
  traceId: string;
}
```

### Example

**Request**:
```json
{
  "traceId": "trace-abc123"
}
```

**Response (success)**:
```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"trace\": {\n    \"id\": \"trace-abc123\",\n    \"name\": \"generate-summary\",\n    \"status\": \"success\",\n    \"spans\": [\n      {\n        \"id\": \"span-001\",\n        \"name\": \"llm-call\",\n        \"parentId\": null,\n        \"startTime\": 1704672000000,\n        \"endTime\": 1704672001234,\n        \"data\": {\n          \"type\": \"GENERATION\",\n          \"model\": \"claude-3-opus\"\n        }\n      }\n    ]\n  }\n}"
  }]
}
```

**Response (not found)**:
```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"error\": \"Trace not found\",\n  \"traceId\": \"trace-invalid\"\n}"
  }],
  "isError": true
}
```

---

## Tool: `search_spans`

**Description**: Search for spans by custom attributes. Can search across all traces or within a specific trace.

### Input Schema (Zod)

```typescript
const SearchSpansInput = z.object({
  filters: z.array(SearchFilter).optional().default([])
    .describe('Filter criteria (combined with AND)'),
  traceId: z.string().optional()
    .describe('Limit search to specific trace'),
  limit: z.number().min(1).max(200).optional().default(50)
    .describe('Results per page'),
  cursor: z.string().optional()
    .describe('Pagination cursor from previous response'),
  sortBy: z.string().optional().default('startTime')
    .describe('Field to sort by'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
    .describe('Sort direction'),
});
```

### Input Schema (JSON Schema)

```json
{
  "type": "object",
  "properties": {
    "filters": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "field": { "type": "string" },
          "operator": { "type": "string", "enum": ["eq", "ne", "gt", "gte", "lt", "lte", "contains"] },
          "value": { "oneOf": [{ "type": "string" }, { "type": "number" }, { "type": "boolean" }] }
        },
        "required": ["field", "operator", "value"]
      },
      "default": [],
      "description": "Filter criteria (combined with AND)"
    },
    "traceId": {
      "type": "string",
      "description": "Limit search to specific trace"
    },
    "limit": {
      "type": "number",
      "minimum": 1,
      "maximum": 200,
      "default": 50
    },
    "cursor": {
      "type": "string"
    },
    "sortBy": {
      "type": "string",
      "default": "startTime"
    },
    "sortOrder": {
      "type": "string",
      "enum": ["asc", "desc"],
      "default": "desc"
    }
  },
  "additionalProperties": false
}
```

### Output

```typescript
interface SearchSpansOutput {
  items: SpanData[];
  total?: number;
  cursor?: string;
  hasMore: boolean;
}
```

### Examples

**Example 1: Find spans by user ID**
```json
{
  "filters": [
    { "field": "data.metadata.user_id", "operator": "eq", "value": "user-12345" }
  ]
}
```

**Example 2: Find GENERATION spans using specific model**
```json
{
  "filters": [
    { "field": "data.type", "operator": "eq", "value": "GENERATION" },
    { "field": "data.model", "operator": "contains", "value": "claude" }
  ]
}
```

**Example 3: Find spans within a trace by status**
```json
{
  "traceId": "trace-abc123",
  "filters": [
    { "field": "status", "operator": "eq", "value": "error" }
  ]
}
```

---

## Error Responses

All tools may return error responses in this format:

```typescript
interface MCPErrorResponse {
  content: [{
    type: 'text';
    text: string;  // JSON-encoded ErrorResponse
  }];
  isError: true;
}

interface ErrorResponse {
  error: string;      // Human-readable message
  code: string;       // Machine-readable code
  details?: object;   // Additional context
}
```

### Error Codes

| Code | Description | Recovery |
|------|-------------|----------|
| `CONNECTION_FAILED` | Cannot reach data source | Check server is running, retry |
| `INVALID_QUERY` | Malformed filter or parameters | Fix query syntax |
| `NOT_FOUND` | Trace/span doesn't exist | Verify ID is correct |
| `TIMEOUT` | Request exceeded time limit | Reduce result set, retry |
| `PARTIAL_FAILURE` | Some results unavailable | Results partial, check warnings |

### Example Error Response

```json
{
  "content": [{
    "type": "text",
    "text": "{\n  \"error\": \"Invalid filter: unknown field 'invalid_field'\",\n  \"code\": \"INVALID_QUERY\",\n  \"details\": {\n    \"field\": \"invalid_field\",\n    \"validFields\": [\"id\", \"name\", \"status\", \"latency\", \"data.*\"]\n  }\n}"
  }],
  "isError": true
}
```

---

## Common Field Paths

### Trace Fields

| Path | Type | Description |
|------|------|-------------|
| `id` | string | Trace ID |
| `name` | string | Trace name |
| `status` | enum | 'success', 'error', 'pending' |
| `latency` | number | Duration in ms |
| `totalCost` | number | Aggregated LLM cost |
| `totalTokens` | number | Aggregated token count |
| `createdAt` | string | ISO timestamp |
| `updatedAt` | string | ISO timestamp |

### Span Fields

| Path | Type | Description |
|------|------|-------------|
| `id` | string | Span ID |
| `traceId` | string | Parent trace ID |
| `parentId` | string | Parent span ID |
| `name` | string | Operation name |
| `startTime` | number | Unix timestamp (ms) |
| `endTime` | number | Unix timestamp (ms) |
| `status` | enum | 'success', 'error', 'pending' |
| `data.type` | enum | 'SPAN', 'GENERATION', 'EVENT' |
| `data.model` | string | LLM model name |
| `data.inputTokens` | number | Input token count |
| `data.outputTokens` | number | Output token count |
| `data.totalCost` | number | Span cost |
| `data.metadata.*` | any | Custom attributes |
