# Feature Specification: MCP Trace Server

**Feature Branch**: `003-mcp-trace-server`
**Created**: 2026-01-08
**Status**: Implemented
**Input**: User description: "Create MCP server for analyzing traces and spans, the server should be able to search for traces and spans using any span attribute or key"

## Clarifications

### Session 2026-01-08

- Q: Should the server support multiple data source types or be tightly coupled to one? → A: Pluggable data sources - support both local traces and AM Cloud integration. MCP server initialized on `agentmark init`.
- Q: How should the system handle errors (data source unavailable, malformed queries, corrupted data)? → A: Graceful degradation - return partial results where possible, clear error messages.
- Q: What MCP tools should be exposed? → A: Two tools: `list_traces` (find traces with pagination), `get_trace` (trace details with span filtering and pagination). Original design called for 3 tools but `get_spans` was consolidated into `get_trace`.
- Q: How should API authentication work for cloud? → A: Simple approach - single `AGENTMARK_URL` env var for data source, optional `AGENTMARK_API_KEY` env var for auth. If API key provided, include in requests; if not, no auth. No URL pattern detection or modes.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Filter Spans by Attribute (Priority: P1)

As a developer debugging a production issue, I want to filter spans within a trace using any attribute (such as status, duration, type, or model) so that I can quickly locate problematic operations and understand system behavior.

**Why this priority**: Filtering is the core functionality for trace debugging. Without filter capabilities, users cannot effectively analyze their trace data to find errors or slow operations.

**Independent Test**: Can be fully tested by invoking the `get_spans` MCP tool with various attribute filters and verifying matching spans are returned.

**Acceptance Scenarios**:

1. **Given** a trace exists with spans, **When** I filter by a span attribute (e.g., status = "2" for errors), **Then** only spans matching that attribute value are returned
2. **Given** a trace exists with spans, **When** I filter by multiple attributes (e.g., status = "0" AND duration > 1000), **Then** only spans matching all criteria are returned
3. **Given** no spans match the filter criteria, **When** I perform a filter, **Then** an empty result set is returned with pagination metadata

---

### User Story 2 - Search Spans Across Traces (Priority: P1)

As a developer investigating a specific user's experience, I want to search for spans across all traces using custom attributes (such as data.type, data.model, or status) so that I can find all occurrences of specific operations system-wide.

**Why this priority**: Cross-trace search enables developers to find patterns across multiple requests, such as all errors with a specific model or all slow database queries.

**Independent Test**: Can be fully tested by calling `get_spans` without a traceId and with filters, verifying matching spans from multiple traces are returned.

**Acceptance Scenarios**:

1. **Given** spans exist across multiple traces, **When** I call `get_spans` without traceId and filter for `data.type = "GENERATION"`, **Then** all LLM generation spans across all traces are returned
2. **Given** spans exist across multiple traces, **When** I filter using `status = "2"` without traceId, **Then** all error spans across all traces are returned
3. **Given** I want to find all slow spans system-wide, **When** I call `get_spans` with `duration > 5000` without traceId, **Then** all slow spans across all traces are returned

---

### User Story 3 - Retrieve Trace Details (Priority: P2)

As a developer analyzing a specific trace, I want to retrieve the complete details of a trace including all its spans and their relationships so that I can understand the full request flow and timing.

**Why this priority**: After finding traces via search, users need to drill down into specific traces to understand the complete picture. This depends on search functionality being available first.

**Independent Test**: Can be fully tested by requesting a trace by ID and verifying all spans, parent-child relationships, and timing information are returned.

**Acceptance Scenarios**:

1. **Given** a valid trace ID, **When** I request trace details, **Then** all spans within that trace are returned with their full attributes
2. **Given** a valid trace ID, **When** I request trace details, **Then** span parent-child relationships are clearly indicated
3. **Given** an invalid or non-existent trace ID, **When** I request trace details, **Then** an appropriate error message is returned

---

### User Story 4 - List Recent Traces (Priority: P2)

As a developer monitoring system health, I want to list recent traces with optional time range filtering so that I can get an overview of recent system activity.

**Why this priority**: Provides a starting point for exploration when users don't have specific search criteria. Useful for general monitoring and discovery.

**Independent Test**: Can be fully tested by requesting recent traces and verifying results are ordered by time and respect any provided time bounds.

**Acceptance Scenarios**:

1. **Given** traces exist, **When** I request recent traces without filters, **Then** the most recent traces are returned in reverse chronological order
2. **Given** traces exist, **When** I specify a sessionId or datasetRunId filter, **Then** only traces matching that filter are returned
3. **Given** many traces exist, **When** I request recent traces, **Then** results are paginated or limited to a reasonable default count

---

### User Story 5 - Debug Traces with AI Agent (Priority: P1)

As a developer debugging an issue, I want to use an AI agent (Claude Code, Cursor, etc.) with MCP tools to analyze my traces so that I can quickly understand what went wrong, why it took so long, and what the point of failure was.

**Why this priority**: This is the primary end-to-end use case that validates the entire feature. The MCP server exists to enable AI-assisted debugging of traces.

**Independent Test**: Can be fully tested by initializing an app, running a trace, and verifying an AI agent can query and analyze the trace data.

**Acceptance Scenarios**:

1. **Given** a user has initialized their app with `agentmark init`, **When** they run a trace, **Then** the MCP server can access that trace data via `list_traces`
2. **Given** an AI agent connects to the MCP server, **When** the agent queries for trace data using `get_trace` and `get_spans`, **Then** it receives sufficient context to debug issues (status, duration, error messages)
3. **Given** a trace has errors, **When** the AI agent filters spans with `status = "2"`, **Then** it can identify the point of failure
4. **Given** a trace is slow, **When** the AI agent filters spans with `duration > threshold`, **Then** it can identify performance bottlenecks

---

### User Story 6 - Paginate Span Results (Priority: P1)

As a developer working with traces that have many spans, I want to paginate through span results so that I can efficiently browse through large traces without overwhelming the system or client.

**Why this priority**: Pagination is essential for handling real-world traces where a single trace may contain hundreds or thousands of spans. Without pagination, the system would be impractical for large traces.

**Independent Test**: Can be fully tested by calling `get_spans` on a trace with many spans and verifying pagination controls work correctly.

**Acceptance Scenarios**:

1. **Given** a trace has more spans than the page size, **When** I request spans with `get_spans`, **Then** I receive the specified number of results plus pagination metadata (cursor, hasMore)
2. **Given** I have received paginated results, **When** I request the next page using the cursor, **Then** I receive the next set of spans without duplicates
3. **Given** I am on the last page of results, **When** I check pagination metadata, **Then** `hasMore` is false and no cursor is returned
4. **Given** I specify a custom limit (1-200), **When** I call `get_spans`, **Then** results are returned in batches of that size

---

### Edge Cases

- **Data source unavailable**: Return clear error message indicating connection failure; suggest checking configuration
- **Malformed search queries**: Return validation error with specific details about what's invalid; do not execute partial query
- **Special characters in attribute values**: Properly escape and handle; search should work with any valid string
- **Corrupted or incomplete trace data**: Return partial results for valid spans; flag incomplete traces in response metadata
- **Page beyond total result count**: Return empty page with metadata indicating total count; no error
- **Concurrent pagination requests**: Each request is stateless; consistent results based on cursor/offset at query time

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST expose two MCP tools: `list_traces` (find traces with pagination), `get_trace` (trace summary with span filtering and pagination via filters/cursor parameters)
- **FR-002**: System MUST support filtering spans by the following standard attributes:
  - `status` (eq operator) - span status code ("0"=ok, "1"=warning, "2"=error)
  - `duration` (gt, gte, lt, lte operators) - span duration in milliseconds
  - `name` (contains operator) - span name substring match
- **FR-003**: System MUST support filtering spans by the following custom attributes using dot notation:
  - `data.type` (eq operator) - span type (e.g., "GENERATION", "SPAN", "EVENT")
  - `data.model` (contains operator) - model name substring match
- **FR-003a**: System MUST throw a descriptive error for unsupported filter field/operator combinations
- **FR-004**: System MUST support combining multiple filter criteria with logical AND operations
- **FR-005**: System MUST return trace summary with status, latency, cost, and token counts via `get_trace`
- **FR-006**: System MUST support retrieving a single trace by its trace ID
- **FR-007**: System MUST support listing recent traces with optional session ID or dataset run ID filtering
- **FR-008**: System MUST support cursor-based pagination for `get_spans` operations
- **FR-009**: System MUST return pagination metadata including cursor and hasMore indicator
- **FR-010**: System MUST support configurable page sizes (default: 50, max: 200)
- **FR-011**: System MUST return meaningful error messages when operations fail or return no results
- **FR-012**: System MUST support the following comparison operators, with field-specific restrictions:
  - `eq` (equals): supported for `status`, `data.type`
  - `gt`, `gte`, `lt`, `lte` (numeric comparison): supported for `duration` only
  - `contains` (case-insensitive substring): supported for `name`, `data.model`
- **FR-013**: System MUST support pluggable data sources through an abstraction layer (HttpDataSource handles both local and AM Cloud via same API)
- **FR-014**: System MUST provide initialization documentation as part of `agentmark init` workflow (README instructions for MCP server configuration)
- **FR-015**: System MUST expose each tool capability as a separate MCP tool (two tools: list_traces, get_trace)
- **FR-016**: System MUST implement graceful degradation - return partial results where possible and clear error messages for failures

### Key Entities

- **Trace**: A collection of spans representing a single distributed request flow. Identified by a unique trace_id. Contains metadata about the overall request.
- **Span**: A single unit of work within a trace. Contains operation name, service name, timing information (start/end), status, parent span reference, and arbitrary key-value attributes.
- **Span Attribute**: A key-value pair attached to a span. Keys are strings, values can be strings, numbers, booleans, or arrays. Used for custom context like user IDs, request parameters, or business data.
- **Search Query**: A structured request specifying attribute filters, comparison operators, and result options (pagination, sorting).
- **Paginated Result**: A response containing a subset of matching results along with metadata for navigating to additional pages (total count, cursor/offset, page size).
- **MCP Tools**: Two exposed tools - `list_traces` (find recent traces with optional session/dataset filtering and pagination), `get_trace` (retrieve trace summary with status, latency, cost, tokens, plus span filtering and pagination). The `get_trace` tool accepts filters and cursor parameters for span operations. Supports filters with operators (eq, gt, gte, lt, lte, contains) enabling search by status, duration, type, model, or custom attributes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can filter and find specific spans within 5 seconds when querying by any single attribute (measured against traces with 1,000 spans on standard developer hardware)
- **SC-002**: Users can successfully combine 3 or more filter criteria in a single query
- **SC-003**: Filter results correctly include all matching spans with 100% accuracy (no false negatives for exact match queries)
- **SC-004**: System returns appropriate feedback for all error conditions (no silent failures)
- **SC-005**: Users can retrieve trace summary with status, latency, cost, and token counts
- **SC-006**: Filter queries with no matches return empty results with pagination metadata within 2 seconds
- **SC-007**: Users can paginate through traces with 10,000+ spans without performance degradation (degradation defined as: response time >10 seconds or memory usage >500MB)
- **SC-008**: Pagination maintains consistent ordering across pages (no duplicates, no missing results)
- **SC-009**: AI agents can successfully debug issues using trace context from MCP tools (identify errors, slow spans, point of failure)
- **SC-010**: System works identically for local traces and AM Cloud traces from the agent's perspective

## Assumptions

- Trace and span data already exists in a queryable data source (local or AM Cloud)
- The data source follows OpenTelemetry or similar standard trace/span schema conventions
- Span attributes are stored in a format that allows flexible key-value querying
- The MCP protocol and infrastructure are available for tool registration and invocation
- Users have appropriate access permissions to query trace data
- MCP server is initialized as part of `agentmark init` workflow

## Deferred Work

The following items are intentionally deferred from the initial implementation:

- **AM Cloud-specific features**: Cloud integration uses the same HttpDataSource with different URL/auth configuration. Advanced cloud-specific features (organization management, access controls, cloud-only analytics) are deferred pending AM Cloud API finalization.
- **Programmatic `agentmark init` integration**: Initial implementation provides README documentation for manual MCP server setup. Automated CLI integration may be added in future iteration.
