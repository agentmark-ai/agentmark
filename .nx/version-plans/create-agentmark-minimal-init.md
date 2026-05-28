---
"create-agentmark": major
---

**Breaking:** `npm create agentmark` is now a minimal init. The CLI no longer scaffolds an example app or picks an LLM adapter — it writes `agentmark.json`, creates an empty `agentmark/` directory, wires MCP configs into the IDE clients you select, installs the AgentMark agent skill, and hands off to your AI tool.

Rationale: the old scaffolder forced a four-template menu (`party-planner`, `customer-support`, `story-teller`, `animal-drawing`) and a language/adapter choice up front, which produced opinionated code that rarely matched the project the user was actually building. The new flow defers the "wire AgentMark into my codebase" decision to the `setup-and-integration` skill workflow, which runs inside the user's AI tool, queries the docs MCP for current framework-specific guidance, and adapts to whatever stack already exists.

What the new CLI does:

1. Writes `agentmark.json` with `agentmarkPath: "."` (skips if present unless `--overwrite`)
2. Creates `agentmark/` with a `.gitkeep` (skips if present)
3. Wires MCP into selected IDE clients via existing `writeMcpConfig()` — multi-select, all 4 pre-selected
4. Installs the AgentMark agent skill (`npx skills add agentmark-ai/skills`, best-effort)
5. Runs `git init` if the target is a greenfield folder
6. Prints handoff: "Open Claude Code, Cursor, VS Code, or Zed and say: Set up AgentMark in this project."

What's gone (breaking):

- Language selection (TypeScript/Python prompt) — adapter handled by skill workflow per docs
- Adapter selection (`--adapter ai-sdk | claude-agent-sdk | mastra | pydantic-ai`)
- API key prompt — skill workflow's "Before you start" check enforces auth via `agentmark login` or `AGENTMARK_API_KEY`
- Deployment-mode prompt (`--cloud` / `--self-host`)
- Single-select IDE prompt — now multi-select with all 4 pre-selected
- `createExampleApp` / `createPythonApp` generators + all template files
- `./templates` package export (no external consumers in the repo)
- `--language`, `--adapter`, `--api-key`, `--deployment-mode` CLI flags

What's preserved:

- `npm create agentmark <folder>` (positional arg)
- `--path`, `--client`, `--overwrite` flags
- Undocumented `--api-url` escape hatch for internal staging / self-hosters
- `installAgentmarkSkill()` flow (unchanged)
- `writeMcpConfig()` flow (unchanged; same three-server layout: `agentmark-docs`, `agentmark`, `agentmark-local`)

Migration for users who relied on the example scaffolder: the four example prompts now live in the docs as copy-paste recipes (see follow-up PR). For first-time onboarding, the new flow is: `npm create agentmark` → open AI tool → "Set up AgentMark in this project."
