# agentmark Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-02-07

## Active Technologies
- SQLite via better-sqlite3 (spans in `Metadata` JSON column) (001-auto-graph-nodes)
- SQLite (CLI/local) and ClickHouse (Cloud) - solution must be database-agnostic (001-auto-graph-nodes)
- TypeScript 5.x + @xyflow/react 12.9.0, dagre 0.8.5, React 19.1.0, MUI 7.x (001-auto-graph-nodes)
- N/A (frontend-only transformation; reads existing span data) (001-auto-graph-nodes)
- Node.js 21 (GitHub Actions), TypeScript 5.x (monorepo packages) + nx ^20.4.0 (already installed), @changesets/cli (to be removed) (004-nx-release)
- N/A (file-based version plans in `.nx/version-plans/`) (004-nx-release)
- TypeScript 5.x (ES2020 target, Node16 module resolution) + @modelcontextprotocol/sdk ^1.11.0, zod ^3.25.0 (003-mcp-trace-server)
- Local SQLite via better-sqlite3 (existing), AM Cloud via REST API (TBD) (003-mcp-trace-server)
- TypeScript 5.x (existing CLI codebase) + commander ^12.1.0 (existing), Node.js built-in `https` module for registry requests (008-cli-update-notifications)
- TypeScript 5.x + @xyflow/react 12.9.0 (React Flow), dagre 0.8.5, React 19.1.0, MUI 7.x (001-auto-graph-nodes)
- TypeScript 5.x, Node.js 18+, Python 3.8+ + cross-env (env vars), shx (shell commands), rimraf (rm -rf) (004-windows-compatibility)
- TypeScript 5.x (Node.js 18+) + fs-extra, prompts (already in use by create-agentmark) (006-existing-repo-init)
- N/A (file system operations only) (006-existing-repo-init)
- TypeScript 5.x, Node.js 18+ + yarn 4.5.3 (workspaces), turbo (build orchestration) (007-fix-dependency-vulnerabilities)
- N/A (dependency management only) (007-fix-dependency-vulnerabilities)

## Project Structure

```text
src/
tests/
```

## Commands

npm test && npm run lint

## Code Style

TypeScript 5.x: Follow standard conventions

## Windows Compatibility (CI runs on `windows-latest`)

CI (`.github/workflows/ci.yml`) runs `build` across `os: [ubuntu-latest, windows-latest]`. Every change must pass on Windows. The recurring failure is **path-separator** assumptions — Windows uses `\`, POSIX uses `/`. Rules:

- **Never assert a hardcoded forward-slash path literal against a value derived from `path.join` / `path.relative` / `path.resolve`** — those return `\` on Windows, so `expect(p).toBe('src/x.ts')` fails. Build the expectation the same way the code does: `expect(p).toBe(path.join('src', 'x.ts'))`, or normalize both sides with `.split(path.sep).join('/')` before comparing. `toContain` is not a loophole — `toContain('a/b')` still fails on `a\b`.
- **Portable, serialized artifacts** (build manifests, generated configs, anything written to disk for users) **must use forward slashes** — normalize with `p.split(path.sep).join('/')` when producing them. Their tests then correctly assert `/` (see `cli/test/build.test.ts` manifest paths, which pass on Windows). Display/CLI output and in-memory FS paths stay native — and their tests must use `path.join`.
- **Temp dirs**: `path.join(os.tmpdir(), ...)`, never a literal `/tmp`.
- **Line endings**: split text on `/\r?\n/`, don't hardcode `\n` or assert exact newline counts; git may check out CRLF on Windows.
- **Shell steps in scripts/package.json**: use the already-adopted `cross-env`, `shx`, `rimraf` (feature `004-windows-compatibility`), not bash-isms (`rm -rf`, `FOO=bar cmd`, `&&`-chained `cp`).
- POSIX-absolute fixtures used only as opaque strings through a **mocked** fs (e.g. the `/etc/passwd` traversal cases in `templatedx/.../schemaRefSecurity.test.ts`) are fine — they never touch a real Windows filesystem.

## Recent Changes
- 008-cli-update-notifications: Added TypeScript 5.x (existing CLI codebase) + commander ^12.1.0 (existing), Node.js built-in `https` module for registry requests
- 007-fix-dependency-vulnerabilities: Added TypeScript 5.x, Node.js 18+ + yarn 4.5.3 (workspaces), turbo (build orchestration)
- 004-nx-release: Added Node.js 21 (GitHub Actions), TypeScript 5.x (monorepo packages) + nx ^20.4.0 (already installed), @changesets/cli (to be removed)
- 006-existing-repo-init: Added TypeScript 5.x (Node.js 18+) + fs-extra, prompts (already in use by create-agentmark)
- 004-windows-compatibility: Added TypeScript 5.x, Node.js 18+, Python 3.8+ + cross-env (env vars), shx (shell commands), rimraf (rm -rf)
- 003-mcp-trace-server: Added TypeScript 5.x (ES2020 target, Node16 module resolution) + @modelcontextprotocol/sdk ^1.11.0, zod ^3.25.0
- 001-auto-graph-nodes: Added TypeScript 5.x + @xyflow/react 12.9.0, dagre 0.8.5, React 19.1.0, MUI 7.x


<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
