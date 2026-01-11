# agentmark Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-11

## Active Technologies
- SQLite via better-sqlite3 (spans in `Metadata` JSON column) (001-auto-graph-nodes)
- SQLite (CLI/local) and ClickHouse (Cloud) - solution must be database-agnostic (001-auto-graph-nodes)
- TypeScript 5.x + @xyflow/react 12.9.0, dagre 0.8.5, React 19.1.0, MUI 7.x (001-auto-graph-nodes)
- N/A (frontend-only transformation; reads existing span data) (001-auto-graph-nodes)
- TypeScript 5.x (ES2020 target, Node16 module resolution) + @modelcontextprotocol/sdk ^1.11.0, zod ^3.25.0 (003-mcp-trace-server)
- Local SQLite via better-sqlite3 (existing), AM Cloud via REST API (TBD) (003-mcp-trace-server)
- TypeScript 5.x, Node.js 18+, Python 3.8+ + cross-env (env vars), shx (shell commands), rimraf (rm -rf) (004-windows-compatibility)
- TypeScript 5.x (Node.js 18+) + fs-extra, prompts (already in use by create-agentmark) (006-existing-repo-init)
- N/A (file system operations only) (006-existing-repo-init)

- TypeScript 5.x + @xyflow/react 12.9.0 (React Flow), dagre 0.8.5, React 19.1.0, MUI 7.x (001-auto-graph-nodes)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x: Follow standard conventions

## Recent Changes
- 006-existing-repo-init: Added TypeScript 5.x (Node.js 18+) + fs-extra, prompts (already in use by create-agentmark)
- 004-windows-compatibility: Added TypeScript 5.x, Node.js 18+, Python 3.8+ + cross-env (env vars), shx (shell commands), rimraf (rm -rf)
- 003-mcp-trace-server: Added TypeScript 5.x (ES2020 target, Node16 module resolution) + @modelcontextprotocol/sdk ^1.11.0, zod ^3.25.0
- 001-auto-graph-nodes: Added TypeScript 5.x + @xyflow/react 12.9.0, dagre 0.8.5, React 19.1.0, MUI 7.x


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
