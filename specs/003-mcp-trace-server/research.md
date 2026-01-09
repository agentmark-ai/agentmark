# Research: MCP Trace Server

**Feature**: 003-mcp-trace-server
**Date**: 2026-01-08
**Status**: Complete

## Research Topics

### 1. Search Implementation Strategy

**Decision**: Extend DataSource interface with `searchTraces` and `searchSpans` methods

**Rationale**:
- Current DataSource interface only supports listing and retrieval, not search
- Search logic should be delegated to the data source (local API or cloud) for efficiency
- Client-side filtering would require fetching all data first, which doesn't scale

**Alternatives Considered**:
- Client-side filtering: Rejected - doesn't scale for large datasets, inefficient
- New SearchDataSource interface: Rejected - unnecessary abstraction, extend existing interface

**Implementation Approach**:
```typescript
interface DataSource {
  // Existing methods
  listTraces(options?: ListTracesOptions): Promise<TraceListItem[]>;
  getTrace(traceId: string): Promise<TraceData | null>;
  getSpans(traceId: string): Promise<SpanData[]>;

  // New search methods
  searchTraces(query: SearchQuery): Promise<PaginatedResult<TraceListItem>>;
  searchSpans(query: SearchQuery): Promise<PaginatedResult<SpanData>>;
}
```

---

### 2. Search Query Structure

**Decision**: Use a structured query object with filters array and pagination options

**Rationale**:
- Supports arbitrary attribute filtering with AND logic (per spec FR-004)
- Comparison operators for numeric fields (per spec FR-012)
- Pagination built into query structure (per spec FR-008)
- Zod schema validation for type safety

**Query Structure**:
```typescript
interface SearchFilter {
  field: string;           // Attribute name (e.g., "service_name", "attributes.user_id")
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains';
  value: string | number | boolean;
}

interface SearchQuery {
  filters: SearchFilter[];  // Combined with AND logic
  limit?: number;           // Default 50, max 200
  cursor?: string;          // Opaque cursor for pagination
  sortBy?: string;          // Field to sort by (default: start_time)
  sortOrder?: 'asc' | 'desc'; // Default: desc
}

interface PaginatedResult<T> {
  items: T[];
  total: number;
  cursor?: string;          // Next page cursor (null if no more)
  hasMore: boolean;
}
```

**Alternatives Considered**:
- GraphQL-style query language: Rejected - overkill for this use case, harder for AI agents to construct
- Simple key=value pairs: Rejected - doesn't support comparison operators

---

### 3. Pagination Strategy

**Decision**: Cursor-based pagination with offset fallback for local data source

**Rationale**:
- Cursor-based is more efficient for large datasets (no counting rows to skip)
- Local SQLite can use ROWID-based cursors
- Cloud API may have its own cursor format
- Stateless - each request is independent (per spec edge case)

**Implementation**:
- Cursor encodes: `{ offset: number, sortField: string, lastValue: any }`
- Base64 encode for opacity
- Return `hasMore: true` when `items.length === limit`
- Total count is optional (expensive for large datasets) - include when < 10,000

**Alternatives Considered**:
- Offset-based only: Rejected - inefficient for deep pages
- Keyset pagination only: Rejected - requires sortable unique key, complex for arbitrary queries

---

### 4. Local Data Source Search Implementation

**Decision**: Delegate search to existing AgentMark CLI API server (localhost:9418)

**Rationale**:
- API server has direct SQLite access with better-sqlite3
- Avoids duplicating database query logic in MCP server
- Consistent with existing `listTraces`, `getTrace` pattern
- API can optimize queries server-side

**Required API Endpoints** (to be added to CLI API):
```
GET /v1/traces/search
  Query params: filters (JSON), limit, cursor, sortBy, sortOrder

GET /v1/spans/search
  Query params: filters (JSON), limit, cursor, sortBy, sortOrder, traceId (optional)
```

**Alternatives Considered**:
- Direct SQLite access from MCP server: Rejected - would require bundling better-sqlite3, duplicates logic
- In-memory search after fetching all: Rejected - doesn't scale

---

### 5. Configuration and Authentication

**Decision**: Simple environment variable configuration with optional API key

**Rationale**:
- Single URL keeps configuration simple
- API key presence determines whether auth is included
- No URL pattern detection or mode switching logic
- Works naturally with MCP server configs in Claude Code, Cursor, etc.

**Configuration**:
```typescript
interface MCPServerConfig {
  url: string;       // From AGENTMARK_URL env var
  apiKey?: string;   // From AGENTMARK_API_KEY env var (optional)
}
```

**Behavior**:
- `AGENTMARK_URL` (required): Data source URL - can be local or cloud
- `AGENTMARK_API_KEY` (optional): If provided, included as auth header in requests
- No implicit mode detection - just makes requests to the URL with/without auth

**MCP Server Config Examples**:

Local (no auth):
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

Cloud (with auth):
```json
{
  "mcpServers": {
    "agentmark-traces": {
      "command": "npx",
      "args": ["@agentmark-ai/mcp-server"],
      "env": {
        "AGENTMARK_URL": "https://api.agentmark.ai",
        "AGENTMARK_API_KEY": "am_xxx..."
      }
    }
  }
}
```

**Alternatives Considered**:
- Separate localUrl/cloudUrl with dataSourceType: Rejected - unnecessary complexity
- URL pattern detection (localhost vs remote): Rejected - fragile, implicit behavior
- Config file for API key: Rejected - less secure than env vars

---

### 6. MCP Tool Naming and Structure

**Decision**: Four tools matching spec, rename `get_spans` to `search_spans`

**Rationale**:
- Spec requires: `search_traces`, `search_spans`, `get_trace`, `list_traces`
- Current `get_spans` extracts spans from a known trace - different from search
- Keep `get_spans` as internal helper, expose `search_spans` as MCP tool

**Tool Definitions**:

| Tool | Purpose | Key Parameters |
|------|---------|----------------|
| `list_traces` | Browse recent traces | limit, sessionId, datasetRunId |
| `search_traces` | Find traces by criteria | filters[], limit, cursor |
| `get_trace` | Get full trace details | traceId |
| `search_spans` | Find spans by criteria | filters[], limit, cursor, traceId (optional) |

**Alternatives Considered**:
- Unified `query` tool: Rejected - spec explicitly requires four tools
- Keep current `get_spans` as MCP tool: Rejected - name doesn't match spec requirement

---

### 7. Error Handling and Graceful Degradation

**Decision**: Structured error responses with partial result support

**Rationale**:
- Spec FR-016 requires graceful degradation
- AI agents need clear error messages to recover
- Partial results help when some data is corrupted

**Error Response Structure**:
```typescript
interface ErrorResponse {
  error: string;            // Human-readable message
  code: string;             // Machine-readable code (e.g., "CONNECTION_FAILED")
  details?: Record<string, unknown>;
}

interface PartialResult<T> {
  items: T[];
  errors?: Array<{
    itemId?: string;
    error: string;
  }>;
  warnings?: string[];
}
```

**Error Codes**:
- `CONNECTION_FAILED` - Data source unavailable
- `INVALID_QUERY` - Malformed filter or parameters
- `NOT_FOUND` - Trace/span doesn't exist
- `TIMEOUT` - Request exceeded time limit

---

### 8. agentmark init Integration

**Decision**: Generate MCP server setup instructions and example config during `agentmark init`

**Rationale**:
- Spec FR-014 requires initialization via `agentmark init`
- Users should get clear instructions for MCP server setup
- Env var configuration works with all MCP clients (Claude Code, Cursor, etc.)

**Integration Points**:
1. `packages/create-agentmark` - Add MCP setup instructions to generated README
2. Provide example MCP config snippets for popular clients
3. Document env vars: `AGENTMARK_URL`, `AGENTMARK_API_KEY`

**Generated README Section**:
```markdown
## MCP Server Setup

Add to your Claude Code or Cursor MCP config:

\`\`\`json
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
\`\`\`

For cloud access, add your API key from AM Cloud dashboard:
\`\`\`json
"env": {
  "AGENTMARK_URL": "https://api.agentmark.ai",
  "AGENTMARK_API_KEY": "your-api-key"
}
\`\`\`
\`\`\`

**Alternatives Considered**:
- `.agentmark/mcp.json` config file: Rejected - MCP clients use their own config format
- Auto-detection of MCP client: Rejected - too many clients, each has different config location

---

## Summary

All technical decisions are resolved. Key outcomes:

1. **Search**: Extend DataSource interface with searchTraces/searchSpans
2. **Query**: Structured filter objects with comparison operators
3. **Pagination**: Cursor-based with Base64-encoded state
4. **Local**: Delegate to CLI API server (new endpoints needed)
5. **Config**: Simple env vars - `AGENTMARK_URL` (required), `AGENTMARK_API_KEY` (optional for auth)
6. **Tools**: Four MCP tools as specified
7. **Errors**: Structured responses with partial result support
8. **Init**: Generate MCP setup instructions in README

Ready for Phase 1: Design & Contracts.
