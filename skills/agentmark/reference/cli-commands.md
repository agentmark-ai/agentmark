<!--
  Auto-generated from oss/agentmark/packages/cli/cli-src/index.ts.
  Do not hand-edit. Run `yarn generate-skill-cli-reference` to regenerate.
-->

# AgentMark CLI commands

> Reference for `@agentmark-ai/cli@0.13.0`. Always prefer `npx agentmark <cmd> --help` for the most current flag set.

## Command index

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
- [`agentmark deploy`](#agentmark-deploy) — [Removed] Use git-based deploys — see release notes

---

## `agentmark dev`

Start development servers (API server + webhook + UI app)

```bash
npx agentmark dev [options]
```

| Flag | Description |
|---|---|
| `--api-port <number>` | API server port (default: 9418) |
| `--webhook-port <number>` | Webhook server port (default: 9417) |
| `--app-port <number>` | AgentMark UI app port (default: 3000) |
| `--no-forward` | Disable trace forwarding to AgentMark Cloud |
| `--no-ui` | Skip the UI app (API + webhook only) — for CI / headless / test use |

---

## `agentmark generate-types`

```bash
npx agentmark generate-types [options]
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
npx agentmark generate-schema [options]
```

| Flag | Description |
|---|---|
| `-o, --out <directory>` | Output directory (default: .agentmark) |

---

## `agentmark pull-models`

Pull models from a provider

```bash
npx agentmark pull-models [options]
```

| Flag | Description |
|---|---|
| `--provider <name>` | Provider key (skips the interactive picker) |
| `--models <csv>` | Comma-separated model IDs to add (skips the interactive multi-select) |

---

## `agentmark run-prompt`

Run a prompt with test props

```bash
npx agentmark run-prompt <filepath> [options]
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
npx agentmark run-experiment <filepath> [options]
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

---

## `agentmark build`

Build prompts and datasets into pre-compiled JSON files for static loading

```bash
npx agentmark build [options]
```

| Flag | Description |
|---|---|
| `-o, --out <directory>` | Output directory (default: dist/agentmark) |

---

## `agentmark login`

Authenticate with the AgentMark platform

```bash
npx agentmark login [options]
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
npx agentmark logout [options]
```

| Flag | Description |
|---|---|
| `--base-url <url>` | Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co) |
| `--json` | Emit a single line of JSON on completion instead of human text |

---

## `agentmark link`

Link current project to a platform app for trace forwarding

```bash
npx agentmark link [options]
```

| Flag | Description |
|---|---|
| `--app-id <uuid>` | App ID to link (skips interactive selection) |
| `--base-url <url>` | Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co) |
| `--json` | Emit a single line of JSON on completion (e.g. for CI capture of appId) |

---

## `agentmark deploy`

[Removed] Use git-based deploys — see release notes

```bash
npx agentmark deploy [options]
```

---

## Headless programmatic access

The CLI is intentionally narrow. For programmatic access to the full AgentMark Cloud API surface (apps, deployments, alerts, datasets, experiments, scores, traces, …), run the `agentmark-mcp` MCP server alongside your IDE agent, or call the gateway REST endpoints directly with an `AGENTMARK_API_KEY`. See `workflows/headless-with-mcp.md` in the agentmark skill, or the gateway OpenAPI spec at `api.agentmark.co/v1/openapi.json`.
