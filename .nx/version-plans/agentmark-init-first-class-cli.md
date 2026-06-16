---
'@agentmark-ai/cli': minor
'create-agentmark': minor
---

Add `agentmark init` as a first-class CLI command: install `@agentmark-ai/cli` globally and run `agentmark init` to scaffold a project (`agentmark.json`, prompts dir, IDE MCP configs, agent skill). `init` additionally pins `@agentmark-ai/cli` as a local dev dependency and adds npm scripts to the project's `package.json` (non-destructively — never clobbering an existing `dev`/`build` script), so CI and teammates resolve the same CLI version from `node_modules/.bin` without a global install. `agentmark doctor` now reports whether that local pin is present (advisory `deps.cli` check). `create-agentmark` (`npm create agentmark`) becomes a thin, dependency-free wrapper that delegates to `agentmark init` via `npx` (reusing an installed CLI or fetching on demand), so both entry points produce identical output without pulling the CLI's full tree into the scaffolder.
