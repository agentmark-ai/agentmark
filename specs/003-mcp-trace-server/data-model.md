# Data Model: MCP Trace Server

**Feature**: 003-mcp-trace-server
**Date**: 2026-01-08
**Source**: Extends existing `packages/mcp-server/src/data-source/types.ts`

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         DataSource                               │
│  (Interface - LocalDataSource | CloudDataSource)                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ returns
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Trace                                   │
│  id: string (primary key)                                       │
│  name?: string                                                   │
│  status?: 'success' | 'error' | 'pending'                       │
│  latency?: number (ms)                                          │
│  totalCost?: number                                             │
│  totalTokens?: number                                           │
│  createdAt?: string (ISO 8601)                                  │
│  updatedAt?: string (ISO 8601)                                  │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 1:N
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                           Span                                   │
│  id: string (primary key)                                       │
│  traceId: string (foreign key → Trace)                          │
│  parentId?: string (self-reference, null for root)              │
│  name: string                                                    │
│  startTime: number (unix timestamp ms)                          │
│  endTime?: number (unix timestamp ms)                           │
│  status?: 'success' | 'error' | 'pending'                       │
│  data?: SpanDataDetails                                         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ 1:1
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SpanDataDetails                             │
│  type?: 'SPAN' | 'GENERATION' | 'EVENT'                         │
│  model?: string                                                  │
│  inputTokens?: number                                           │
│  outputTokens?: number                                          │
│  totalCost?: number                                             │
│  input?: string | object                                        │
│  output?: string | object                                       │
│  metadata?: Record<string, unknown> (custom attributes)         │
│  toolCalls?: ToolCall[]                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Entities

### Trace (TraceListItem / TraceData)

Represents a distributed request flow containing multiple spans.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique trace identifier |
| name | string | No | Human-readable trace name |
| status | enum | No | Overall status: 'success', 'error', 'pending' |
| latency | number | No | Total duration in milliseconds |
| totalCost | number | No | Aggregated LLM cost |
| totalTokens | number | No | Aggregated token count |
| createdAt | string | No | ISO 8601 timestamp |
| updatedAt | string | No | ISO 8601 timestamp |
| spans | Span[] | No | Full span hierarchy (TraceData only) |

**Validation Rules**:
- `id` must be non-empty string
- `status` must be one of defined enum values
- `latency`, `totalCost`, `totalTokens` must be non-negative if present

---

### Span (SpanData)

Represents a single unit of work within a trace.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | Yes | Unique span identifier |
| traceId | string | Yes | Parent trace identifier |
| parentId | string | No | Parent span ID (null for root span) |
| name | string | Yes | Operation/span name |
| startTime | number | Yes | Start timestamp (unix ms) |
| endTime | number | No | End timestamp (unix ms) |
| status | enum | No | Span status: 'success', 'error', 'pending' |
| data | SpanDataDetails | No | Extended span metadata |

**Validation Rules**:
- `id` and `traceId` must be non-empty strings
- `startTime` must be positive integer
- `endTime` must be >= `startTime` if present
- `parentId` must reference existing span in same trace (or null)

**Relationships**:
- Belongs to exactly one Trace (via `traceId`)
- May have one parent Span (via `parentId`)
- May have multiple child Spans (reverse of `parentId`)

---

### SpanDataDetails

Extended metadata for a span, including LLM-specific information.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| type | enum | No | Span type: 'SPAN', 'GENERATION', 'EVENT' |
| model | string | No | LLM model identifier (for GENERATION) |
| inputTokens | number | No | Input token count |
| outputTokens | number | No | Output token count |
| totalCost | number | No | Cost for this span |
| input | string/object | No | Input data/prompt |
| output | string/object | No | Output data/response |
| metadata | Record | No | Custom key-value attributes |
| toolCalls | ToolCall[] | No | Tool invocations (for agents) |

**Searchable Fields** (via `metadata`):
- Any key in `metadata` can be searched using dot notation
- Example: `metadata.user_id`, `metadata.request_id`

---

### SearchFilter

Query filter for search operations.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| field | string | Yes | Attribute path to filter on |
| operator | enum | Yes | Comparison operator |
| value | mixed | Yes | Value to compare against |

**Operators**:
- `eq` - Equal
- `ne` - Not equal
- `gt` - Greater than (numeric)
- `gte` - Greater than or equal (numeric)
- `lt` - Less than (numeric)
- `lte` - Less than or equal (numeric)
- `contains` - String contains (case-insensitive)

**Field Path Examples**:
- `status` - Top-level trace/span field
- `name` - Trace/span name
- `data.type` - Span type
- `data.model` - LLM model
- `data.metadata.user_id` - Custom attribute

---

### SearchQuery

Parameters for search operations.

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| filters | SearchFilter[] | No | [] | Filter criteria (AND logic) |
| limit | number | No | 50 | Results per page (max 200) |
| cursor | string | No | null | Pagination cursor |
| sortBy | string | No | 'createdAt' | Sort field |
| sortOrder | enum | No | 'desc' | Sort direction |

**Validation Rules**:
- `limit` must be 1-200
- `sortOrder` must be 'asc' or 'desc'
- `cursor` must be valid Base64 if provided

---

### PaginatedResult<T>

Response wrapper for paginated results.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| items | T[] | Yes | Result items |
| total | number | No | Total matching count (omitted if > 10,000) |
| cursor | string | No | Next page cursor (null if last page) |
| hasMore | boolean | Yes | Whether more results exist |

---

### ErrorResponse

Structured error for MCP tool responses.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| error | string | Yes | Human-readable message |
| code | string | Yes | Machine-readable error code |
| details | object | No | Additional context |

**Error Codes**:
- `CONNECTION_FAILED` - Cannot reach data source
- `INVALID_QUERY` - Malformed search parameters
- `NOT_FOUND` - Resource doesn't exist
- `TIMEOUT` - Request exceeded time limit
- `PARTIAL_FAILURE` - Some results unavailable

---

## State Transitions

### Trace Status

```
           ┌─────────┐
           │ pending │ (initial, trace started)
           └────┬────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
  ┌─────────┐       ┌─────────┐
  │ success │       │  error  │
  └─────────┘       └─────────┘
  (all spans OK)    (any span failed)
```

### Span Status

```
           ┌─────────┐
           │ pending │ (span started, no endTime)
           └────┬────┘
                │
       ┌────────┴────────┐
       ▼                 ▼
  ┌─────────┐       ┌─────────┐
  │ success │       │  error  │
  └─────────┘       └─────────┘
  (completed OK)    (exception/failure)
```

## TypeScript Type Definitions

```typescript
// Core entities (existing in types.ts)
export interface TraceListItem {
  id: string;
  name?: string;
  status?: 'success' | 'error' | 'pending';
  latency?: number;
  totalCost?: number;
  totalTokens?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TraceData extends TraceListItem {
  spans: SpanData[];
}

export interface SpanData {
  id: string;
  traceId: string;
  parentId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status?: 'success' | 'error' | 'pending';
  data?: SpanDataDetails;
}

export interface SpanDataDetails {
  type?: 'SPAN' | 'GENERATION' | 'EVENT';
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
  input?: string | Record<string, unknown>;
  output?: string | Record<string, unknown>;
  metadata?: Record<string, unknown>;
  toolCalls?: ToolCall[];
}

// New types for search
export type ComparisonOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';

export interface SearchFilter {
  field: string;
  operator: ComparisonOperator;
  value: string | number | boolean;
}

export interface SearchQuery {
  filters?: SearchFilter[];
  limit?: number;
  cursor?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  items: T[];
  total?: number;
  cursor?: string;
  hasMore: boolean;
}

export interface ErrorResponse {
  error: string;
  code: 'CONNECTION_FAILED' | 'INVALID_QUERY' | 'NOT_FOUND' | 'TIMEOUT' | 'PARTIAL_FAILURE';
  details?: Record<string, unknown>;
}

// Extended DataSource interface
export interface DataSource {
  listTraces(options?: ListTracesOptions): Promise<TraceListItem[]>;
  getTrace(traceId: string): Promise<TraceData | null>;
  getSpans(traceId: string): Promise<SpanData[]>;

  // New search methods
  searchTraces(query: SearchQuery): Promise<PaginatedResult<TraceListItem>>;
  searchSpans(query: SearchQuery): Promise<PaginatedResult<SpanData>>;
}
```
