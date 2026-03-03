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
agentmark dev --api-port 9418 --app-port 3000
agentmark dev --remote    # Connect to AgentMark Cloud (login + trace forwarding)
agentmark dev --tunnel    # Expose webhook server publicly
```

The dev server auto-detects your project language (TypeScript or Python), finds your virtual environment, and handles port conflicts automatically.

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
```

Output formats: `table` (default), `csv`, `json`, `jsonl`.

### `agentmark build`

Pre-compile `.prompt.mdx` files into JSON for production use with the file loader.

```bash
agentmark build
agentmark build --out dist/prompts
```

### `agentmark generate-types`

Generate TypeScript type definitions from your prompts for type-safe usage in code.

```bash
agentmark generate-types
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

Full documentation at [docs.agentmark.co](https://docs.agentmark.co/agentmark/).

## License

[MIT](../../LICENSE.md)
