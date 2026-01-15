# Implementation Plan: MCP Trace Server

**Branch**: `003-mcp-trace-server` | **Date**: 2026-01-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-mcp-trace-server/spec.md`

## Summary

Build an MCP server for analyzing traces and spans with three tools (`list_traces`, `get_trace`, `get_spans`). The `get_spans` tool supports filtering by any attribute and pagination, enabling AI agents to debug traces by finding errors, slow operations, and points of failure. The server supports pluggable data sources (local via CLI API and AM Cloud), is initialized via `agentmark init`, and enables AI-assisted debugging of trace data.

## Technical Context

**Language/Version**: TypeScript 5.x (ES2020 target, Node16 module resolution)
**Primary Dependencies**: @modelcontextprotocol/sdk ^1.11.0, zod ^3.25.0
**Storage**: Local SQLite via better-sqlite3 (existing), AM Cloud via REST API (TBD)
**Testing**: vitest
**Target Platform**: Node.js ESM (CLI tool, MCP server)
**Project Type**: Monorepo package (`packages/mcp-server`)
**Performance Goals**: Search response within 5 seconds, pagination through 10,000+ traces
**Constraints**: Graceful degradation on errors, stateless pagination
**Scale/Scope**: Local development and cloud-connected debugging workflows

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Markdown-First Design | N/A | MCP server is infrastructure, not prompt definition |
| II. Adapter Neutrality | ✅ PASS | DataSource interface provides adapter pattern for local/cloud |
| III. Type Safety | ✅ PASS | Zod schemas for tool parameters, TypeScript strict mode |
| IV. Testability | ✅ PASS | vitest with mocked DataSource, unit + integration tests |
| V. Composability | ✅ PASS | MCP tools are independently callable, DataSource is pluggable |

**Gate Result**: PASS - All applicable principles satisfied.

## Project Structure

### Documentation (this feature)

```text
specs/003-mcp-trace-server/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (MCP tool schemas)
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
packages/mcp-server/
├── src/
│   ├── bin.ts                    # CLI entry point
│   ├── server.ts                 # MCP server & tool registration
│   ├── config.ts                 # Configuration management
│   ├── index.ts                  # Public exports
│   └── data-source/
│       ├── index.ts              # Data source factory
│       ├── types.ts              # Type definitions & interfaces
│       └── http-data-source.ts   # HTTP client (works for local & cloud)
├── test/
│   ├── http-data-source.test.ts
│   └── server.test.ts
├── package.json
├── tsconfig.json
└── tsup.config.ts
```

**Structure Decision**: Single `HttpDataSource` implementation handles both local and cloud backends since the API is identical - only URL and auth differ.

## Implementation Gap Analysis

### Current State (003-mcp-trace-server branch)

| Component | Status | Notes |
|-----------|--------|-------|
| `list_traces` tool | ✅ Implemented | Returns TraceListItem array with limit, sessionId, datasetRunId filters |
| `get_trace` tool | ✅ Implemented | Returns trace summary with status, latency, cost, tokens |
| `get_spans` tool | ✅ Implemented | Returns spans with filtering (any attribute) and cursor-based pagination |
| HttpDataSource | ✅ Implemented | HTTP client for local (localhost:9418) and cloud, handles auth |
| DataSource interface | ✅ Implemented | listTraces, getTrace, getSpans (with GetSpansOptions) |
| Factory pattern | ✅ Implemented | createDataSource() in data-source/index.ts |

### Required Additions (per spec)

| Component | Status | Priority | Notes |
|-----------|--------|----------|-------|
| `get_spans` with filtering | ✅ Implemented | P1 | Filter by any attribute with AND logic, replaces search tools |
| `get_spans` with pagination | ✅ Implemented | P1 | Cursor-based pagination with hasMore indicator |
| Comparison operators | ✅ Implemented | P1 | eq, gt, gte, lt, lte, contains |
| HttpDataSource | ✅ Implemented | P1 | Works for both local CLI and AM Cloud |
| agentmark init integration | ✅ Implemented | P2 | README documentation for MCP server setup |
| Graceful degradation | ✅ Implemented | P1 | Connection failures, timeouts, error handling |

**Note**: Original spec called for `search_traces` and `search_spans` tools, but implementation was simplified to enhance `get_spans` with filtering and pagination. This provides the same debugging capability (find errors, slow spans, filter by any attribute) with a simpler API.

## Complexity Tracking

No constitution violations requiring justification.
