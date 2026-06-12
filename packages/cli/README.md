# AgentMark CLI

The command-line tool for developing, testing, and evaluating AI agents with AgentMark.

## Installation

```bash
npm install -g @agentmark-ai/cli
```

Or use it directly with `npx`:

```bash
npx @agentmark-ai/cli dev
```

## Quick Start

```bash
# Scaffold a new project
npm create agentmark@latest

# Start the dev server (API + trace UI + hot reload)
agentmark dev

# Run a prompt with its test props
agentmark run-prompt my-prompt.prompt.mdx

# Run an experiment against a dataset
agentmark run-experiment my-prompt.prompt.mdx
```

## Commands

### `agentmark dev`

Start the local development environment: API server, webhook server, and trace UI.

```bash
agentmark dev
agentmark dev --api-port 9418 --webhook-port 9417 --app-port 3000
agentmark dev --no-ui         # API + webhook only (CI / headless use)
agentmark dev --no-forward    # Disable trace forwarding to AgentMark Cloud
```

The dev server auto-detects your project language (TypeScript or Python), finds your virtual environment, and handles port conflicts automatically.

### `agentmark doctor`

Diagnose your project setup: config, prompts, environment, and (optionally) a live smoke test against the dev server.

```bash
agentmark doctor
agentmark doctor --json             # Machine-readable report
agentmark doctor --strict           # Exit non-zero on warnings too (useful in CI)
agentmark doctor --smoke --boot     # Also run a prompt end-to-end and verify the trace
```

### `agentmark run-prompt <filepath>`

Execute a single prompt and display the result.

```bash
# Run with test props from the prompt's frontmatter
agentmark run-prompt customer-support.prompt.mdx

# Run with custom props
agentmark run-prompt customer-support.prompt.mdx --props '{"customer_question": "Where is my order?"}'

# Run with props from a file
agentmark run-prompt customer-support.prompt.mdx --props-file test-data.json
```

Output includes the LLM response, token usage, cost, and a link to the trace in the local UI.

### `agentmark run-experiment <filepath>`

Run a prompt against every item in its dataset, with optional evaluations.

```bash
# Run with evals (default)
agentmark run-experiment my-prompt.prompt.mdx

# Skip evals
agentmark run-experiment my-prompt.prompt.mdx --skip-eval

# Output as JSON instead of table
agentmark run-experiment my-prompt.prompt.mdx --format json

# Fail if pass rate is below 80%
agentmark run-experiment my-prompt.prompt.mdx --threshold 80

# Sample 20% of the dataset, reproducibly
agentmark run-experiment my-prompt.prompt.mdx --sample 20 --seed 42

# Run specific rows only
agentmark run-experiment my-prompt.prompt.mdx --rows 0,3-5,9

# Compare against a prior run and fail on regressions
agentmark run-experiment my-prompt.prompt.mdx --baseline-commit <ref>
```

Output formats: `table` (default), `csv`, `json`, `jsonl`, `junit`.

### `agentmark build`

Pre-compile `.prompt.mdx` files into JSON for production use with the file loader.

```bash
agentmark build
agentmark build --out dist/agentmark   # default output directory
```

### `agentmark generate-types`

Generate type definitions from your prompts for type-safe usage in code.

```bash
agentmark generate-types
agentmark generate-types --language python
```

### `agentmark generate-schema`

Generate a JSON Schema for `.prompt.mdx` frontmatter, enabling IDE validation and autocomplete.

```bash
agentmark generate-schema
agentmark generate-schema --out .agentmark
```

### `agentmark pull-models`

Interactively select and add LLM models from a provider to your `agentmark.json`.

```bash
agentmark pull-models
agentmark pull-models --provider anthropic --models <csv>   # non-interactive
```

### `agentmark login` / `agentmark logout`

Authenticate with AgentMark Cloud.

```bash
agentmark login
agentmark logout
```

### `agentmark link`

Link your project to an AgentMark Cloud app for trace forwarding.

```bash
agentmark link
agentmark link --app-id <uuid>
```

## Documentation

Full CLI reference at [docs.agentmark.co/reference/cli-commands](https://docs.agentmark.co/reference/cli-commands).

## License

[AGPL-3.0-or-later](../../LICENSE.md)
