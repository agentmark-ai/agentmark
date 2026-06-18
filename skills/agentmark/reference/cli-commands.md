<!--
  Auto-generated from oss/agentmark/packages/cli/cli-src/index.ts.
  Do not hand-edit. Run `yarn generate-skill-cli-reference` to regenerate.
-->

# AgentMark CLI commands

> Generated from the CLI command definitions in `cli-src/index.ts`. Install once with `npm install -g @agentmark-ai/cli` (or prefix any command with `npx`), then prefer `agentmark <cmd> --help` for the exact flag set on your installed version — the published CLI may be newer than the source this was generated from.

## Command index

- [`agentmark init`](#agentmark-init) — Set up AgentMark in a new or existing project: writes agentmark.json, creates the prompts dir, pins @agentmark-ai/cli locally, and wires IDE MCP configs
- [`agentmark doctor`](#agentmark-doctor) — Check that your AgentMark project is set up correctly (config, prompts, client, dependencies)
- [`agentmark dev`](#agentmark-dev) — Start development servers (API server + webhook + UI app)
- [`agentmark generate-types`](#agentmark-generate-types) — (no description)
- [`agentmark generate-schema`](#agentmark-generate-schema) — Generate JSON Schema for .prompt.mdx frontmatter (enables IDE squiggles for model_name)
- [`agentmark pull-models`](#agentmark-pull-models) — Pull models from a provider
- [`agentmark run-prompt`](#agentmark-run-prompt) — Run a prompt with test props
- [`agentmark run-experiment`](#agentmark-run-experiment) — Run an experiment against its dataset, with evals by default
- [`agentmark build`](#agentmark-build) — Build prompts and datasets into pre-compiled JSON files for static loading
- [`agentmark login`](#agentmark-login) — Authenticate with the AgentMark platform
- [`agentmark logout`](#agentmark-logout) — Clear CLI authentication and revoke dev API keys
- [`agentmark link`](#agentmark-link) — Link current project to a platform app for trace forwarding

---

## `agentmark init`

Set up AgentMark in a new or existing project: writes agentmark.json, creates the prompts dir, pins @agentmark-ai/cli locally, and wires IDE MCP configs

```bash
agentmark init [folder] [options]
```

| Flag | Description |
|---|---|
| `--path <folder>` | Target directory (alternative to the positional [folder]). Default: "." inside an existing project, else "my-agentmark-app" |
| `--client <ids>` | IDE clients to wire MCP configs for, comma-separated: claude-code, codex, cursor, vscode, zed (or "all") |
| `-y, --yes` | Non-interactive: accept the default for every prompt (folder default, all IDE clients, keep an existing agentmark.json). For CI and coding agents |
| `--overwrite` | Replace an existing agentmark.json with the default config |
| `--api-url <url>` | Override the AgentMark gateway URL for the cloud MCP entry (internal staging / self-host) |

---

## `agentmark doctor`

Check that your AgentMark project is set up correctly (config, prompts, client, dependencies)

```bash
agentmark doctor [options]
```

| Flag | Description |
|---|---|
| `--json` | Emit the report as JSON instead of human-readable text |
| `--strict` | Exit non-zero on warnings too (useful in CI) |
| `--smoke` | Also run a live tier: execute a prompt against `agentmark dev` and verify the emitted trace |
| `--boot` | With --smoke, start `agentmark dev` automatically and tear it down after (one command, e.g. for CI/agents) |
| `--prompt <path>` | Prompt to run for --smoke (defaults to the first prompt found) |
| `--props <json>` | Props as a JSON string for the --smoke prompt (requires --prompt; e.g. '{"name":"Alice"}') |
| `--webhook-port <number>` | Webhook port --smoke targets / --boot starts dev on (default: 9417) |
| `--api-port <number>` | API-server port --smoke reads traces from / --boot starts dev on (default: 9418) |

---

## `agentmark dev`

Start development servers (API server + webhook + UI app)

```bash
agentmark dev [options]
```

| Flag | Description |
|---|---|
| `--api-port <number>` | API server port (default: 9418) |
| `--webhook-port <number>` | Webhook server port (default: 9417) |
| `--app-port <number>` | AgentMark UI app port (default: 3000) |
| `--no-forward` | Disable trace forwarding to AgentMark Cloud |
| `--no-ui` | Skip the UI app (API + webhook only) — for CI / headless / test use |
| `--no-watch` | Don't restart on file changes; exit on a dev-entry crash so the error surfaces (for CI / headless / boot use) |

---

## `agentmark generate-types`

```bash
agentmark generate-types [options]
```

| Flag | Description |
|---|---|
| `-l, --language <language>` | Language to generate types for |
| `--local <port>` | Local server port number |
| `--root-dir <path>` | Root directory containing agentmark files |

---

## `agentmark generate-schema`

Generate JSON Schema for .prompt.mdx frontmatter (enables IDE squiggles for model_name)

```bash
agentmark generate-schema [options]
```

| Flag | Description |
|---|---|
| `-o, --out <directory>` | Output directory (default: .agentmark) |

---

## `agentmark pull-models`

Pull models from a provider

```bash
agentmark pull-models [options]
```

| Flag | Description |
|---|---|
| `--provider <name>` | Provider key (skips the interactive picker) |
| `--models <csv>` | Comma-separated model IDs to add (skips the interactive multi-select) |
| `--list` | Print available providers (or models for --provider <name>) as JSON and exit — no agentmark.json changes |

---

## `agentmark run-prompt`

Run a prompt with test props

```bash
agentmark run-prompt <filepath> [options]
```

| Flag | Description |
|---|---|
| `--server <url>` | URL of an AgentMark webhook server (e.g., http://localhost:9417) |
| `--props <json>` | Props as JSON string (e.g., '{"key": "value"}') |
| `--props-file <path>` | Path to JSON or YAML file containing props |

---

## `agentmark run-experiment`

Run an experiment against its dataset, with evals by default

```bash
agentmark run-experiment <filepath> [options]
```

| Flag | Description |
|---|---|
| `--server <url>` | URL of an AgentMark webhook server (e.g., http://localhost:9417) |
| `--skip-eval` | Skip running evals even if they exist |
| `--format <format>` | Output format: table, csv, json, jsonl, or junit (default: table) |
| `--threshold <percent>` | Fail if pass percentage is below threshold (0-100) |
| `--sample <percent>` | Sample N% of dataset rows randomly |
| `--rows <spec>` | Select specific rows by index/range (e.g., 0,3-5,9) |
| `--split <spec>` | Train/test split (e.g., train:80, test:80) |
| `--seed <number>` | Seed for reproducible sampling/splitting |
| `--truncate <chars>` | Truncate table cell content to N chars (default: 1000, 0 = no limit) |
| `--concurrency <number>` | Dataset rows to run in parallel (default: 20) |
| `--baseline-commit <ref>` | Git ref (or tree hash) of a prior run to compare against; enables the regression gate via test_settings.regression_tolerance |

---

## `agentmark build`

Build prompts and datasets into pre-compiled JSON files for static loading

```bash
agentmark build [options]
```

| Flag | Description |
|---|---|
| `-o, --out <directory>` | Output directory (default: dist/agentmark) |

---

## `agentmark login`

Authenticate with the AgentMark platform

```bash
agentmark login [options]
```

| Flag | Description |
|---|---|
| `--base-url <url>` | Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co) |
| `--print-url` | Print the auth URL instead of opening a browser (for SSH/CI/IDE-embedded contexts) |
| `--json` | Emit a single line of JSON on completion instead of human text |
| `--timeout <seconds>` | How long the CLI waits for the browser handoff before failing (default: 120 seconds / 2 minutes) |

---

## `agentmark logout`

Clear CLI authentication and revoke dev API keys

```bash
agentmark logout [options]
```

| Flag | Description |
|---|---|
| `--base-url <url>` | Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co) |
| `--json` | Emit a single line of JSON on completion instead of human text |

---

## `agentmark link`

Link current project to a platform app for trace forwarding

```bash
agentmark link [options]
```

| Flag | Description |
|---|---|
| `--app-id <uuid>` | App ID to link (skips interactive selection) |
| `--base-url <url>` | Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co) |
| `--json` | Emit a single line of JSON on completion (e.g. for CI capture of appId) |

---

## Headless programmatic access

The CLI is intentionally narrow. For programmatic access to the full AgentMark Cloud API surface (apps, deployments, alerts, datasets, experiments, scores, traces, …), run the `agentmark-mcp` MCP server alongside your IDE agent, or call the gateway REST endpoints directly with an `AGENTMARK_API_KEY`. See `workflows/headless-with-mcp.md` in the agentmark skill, or the gateway OpenAPI spec at `api.agentmark.co/v1/openapi.json`.
