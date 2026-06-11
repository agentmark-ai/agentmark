<h1 align="center">AgentMark</h1>

<p align="center">
  <a href="https://github.com/agentmark-ai/agentmark">
    <img src="https://raw.githubusercontent.com/agentmark-ai/agentmark/main/assets/agentmark.png" alt="AgentMark git-native AI agent platform" width="200">
  </a>
</p>

<p align="center">
  <strong>Git-native AI agents.</strong><br>
  <sub>Prompts and datasets in your repo. Evals in CI. Traces in your OTEL backend.</sub>
</p>

<p align="center">
  <a href="https://www.agentmark.co">Homepage</a> &middot;
  <a href="https://docs.agentmark.co">Docs</a> &middot;
  <a href="https://app.agentmark.co">Cloud</a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@agentmark-ai/cli"><img src="https://img.shields.io/npm/v/@agentmark-ai/cli.svg?label=%40agentmark-ai%2Fcli" alt="npm version"></a>
  <a href="./LICENSE.md"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="License: AGPL-3.0"></a>
  <a href="https://github.com/agentmark-ai/agentmark/stargazers"><img src="https://img.shields.io/github/stars/agentmark-ai/agentmark.svg?style=social" alt="GitHub stars"></a>
</p>

---

AgentMark is an open-source platform for building reliable AI agents. Define prompts in Markdown, run them with the SDK you already use, evaluate against datasets locally or in CI, and trace every call with OpenTelemetry.

- **Prompt management.** Prompts are `.prompt.mdx` files with type-safe inputs, tool definitions, structured outputs, conditionals, loops, and reusable components. They live in your repo, get reviewed in PRs, and roll back with `git revert`.
- **Datasets.** JSONL files in your repo. Each row is a line, so git diffs show exactly which test cases changed.
- **Evaluations.** Run prompts over datasets with built-in or custom evaluators. Use the CLI or call the SDK from your own pipelines. Block merges on regressions, the way tests do.
- **Tracing.** Every LLM call emits an OpenTelemetry span. Inspect traces in the local dev UI, or forward them to AgentMark Cloud (or any OTEL backend) for search, dashboards, and alerts in production.
- **Type safety.** Auto-generated TypeScript types from your prompts. JSON Schema validation in your editor.

## Quick start

> **Requires:** Node.js 18 or newer.

```bash
# Scaffold a new project (interactive: picks your language)
npm create agentmark@latest my-agents
cd my-agents

# Start the dev server (API + trace UI + hot reload)
agentmark dev

# Run a single prompt
agentmark run-prompt prompts/my-prompt.prompt.mdx

# Run an experiment against a dataset
agentmark run-experiment prompts/my-prompt.prompt.mdx
```

About five minutes from `npm create` to a traced prompt running locally (assuming you have an LLM API key set up).

## What a prompt looks like

```mdx
---
name: customer-support-agent
text_config:
  model_name: anthropic/claude-sonnet-4-20250514
  max_calls: 2
  tools:
    search_knowledgebase:
      description: Search the knowledge base for shipping, warranty, and returns info.
      parameters:
        type: object
        properties:
          query:
            type: string
        required: [query]
test_settings:
  props:
    customer_question: "How long does shipping take?"
input_schema:
  type: object
  properties:
    customer_question:
      type: string
  required: [customer_question]
---

<System>
You are a helpful customer service agent. Use the search_knowledgebase tool
when customers ask about shipping, warranty, or returns.
</System>

<User>{props.customer_question}</User>
```

Run it:

```bash
agentmark run-prompt customer-support.prompt.mdx
```

The prompt is version-controlled, type-checked, and traced. The same file works with any SDK — the Vercel AI SDK, the raw OpenAI or Anthropic client, Pydantic AI, or your own bespoke client. AgentMark renders the prompt to a neutral `{ messages, ...config }` shape; your SDK makes the call.

## Why git-native

Most AI tooling treats the dashboard as the primary workspace. Prompts are rows in a database. Edits happen in a browser. Version history is whatever audit log the vendor decided to expose.

That's fine for prototyping. It stops working as soon as you do anything an engineering team would normally do with code. Branch off main to try a variant. Review a prompt change in a PR. Run evals in CI before a merge. Look up who changed the retrieval logic last quarter. Roll back when something breaks.

AgentMark treats prompts, datasets, and evals like the rest of your code. Prompts are MDX files. Datasets are JSONL. Evals are functions you import. Branches, PRs, `git log`, `git revert`: they all work the same way they do for anything else in your repo.

And when you decide to leave, your prompts are already in your repo and your traces are already in whatever OTEL backend you point them at. No export job, no vendor migration.

> Want to try it on a team? **[Start free on AgentMark Cloud →](https://app.agentmark.co)** &nbsp;|&nbsp; **[Read the docs →](https://docs.agentmark.co)**

## Features

| Feature | Description |
|---------|-------------|
| [Multimodal generation](https://docs.agentmark.co/build/generation-types/overview) | Generate text, structured objects, images, and speech from a single prompt file. |
| [Tools and agents](https://docs.agentmark.co/build/tools-and-agents) | Define tools inline. Build agentic loops with `max_calls`. |
| [Structured output](https://docs.agentmark.co/build/generation-types/object) | Type-safe JSON output via JSON Schema definitions. |
| [Datasets and evals](https://docs.agentmark.co/evaluate/overview) | Run prompts over JSONL datasets with built-in or custom evaluators. |
| [Tracing](https://docs.agentmark.co/observe/tracing-setup) | OpenTelemetry-native tracing for every LLM call, local and cloud. |
| [Type safety](https://docs.agentmark.co/sdk-reference/typescript/type-safety) | Auto-generated TypeScript types from your prompts. JSON Schema validation in your IDE. |
| [Reusable components](https://docs.agentmark.co/build/components) | Import and compose prompt fragments across files. |
| [Conditionals and loops](https://docs.agentmark.co/build/syntax) | Dynamic prompts with `<If>`, `<ForEach>`, props, and filter functions. |
| [File attachments](https://docs.agentmark.co/build/file-attachments) | Attach images and documents for vision and document tasks. |
| [MCP servers](https://docs.agentmark.co/build/mcp) | Call Model Context Protocol tools directly from prompts. |
| [MCP trace server](https://www.npmjs.com/package/@agentmark-ai/mcp-server) | Debug traces from Claude Code, Cursor, or any MCP client. |

## Bring your own SDK

AgentMark doesn't call LLM APIs directly, and there are no SDK-specific adapters to install. Prompts render to a neutral `{ messages, ...config }` shape that you hand to whatever SDK you already use — so you keep your existing client, retry logic, and auth:

```ts
import { createAgentMark } from "@agentmark-ai/prompt-core";

const agentmark = createAgentMark({ loader });
const prompt = await agentmark.loadTextPrompt("customer-support.prompt.mdx");
const { messages, ...config } = await prompt.format({ props });
// hand `messages` + `config` to your SDK of choice
```

See the [bring-your-own-SDK guide](https://docs.agentmark.co/integrations/bring-your-own-sdk) for the full integration path, including the `createExecutor` builder that lets AgentMark Cloud and `agentmark dev` run prompts through your SDK.

## Language support

| Language | Status |
|----------|--------|
| TypeScript / JavaScript | Supported |
| Python | Supported |
| Others | [Open an issue](https://github.com/agentmark-ai/agentmark/issues) |

## Examples

See the [`examples/`](./examples) directory for complete, runnable projects:

- **[Hello World](./examples/01-hello-world):** the simplest possible prompt
- **[Structured Output](./examples/02-structured-output):** extract typed JSON with a schema
- **[Tool Use](./examples/03-tool-use):** an agent with tool calling
- **[Reusable Components](./examples/04-reusable-components):** import and compose prompts
- **[Evaluations](./examples/05-evaluations):** test prompts against datasets
- **[Production Tracing](./examples/06-production-tracing):** trace LLM calls with the SDK

## Packages

| Package | Description |
|---------|-------------|
| [`@agentmark-ai/cli`](./packages/cli) | CLI for local development, prompt running, experiments, and building. |
| [`@agentmark-ai/sdk`](./packages/sdk) | SDK for tracing and cloud platform integration. |
| [`@agentmark-ai/prompt-core`](./packages/prompt-core) | Core prompt parsing and formatting engine. |
| [`@agentmark-ai/templatedx`](./packages/templatedx) | MDX-based template engine with JSX components, conditionals, and loops. |
| [`@agentmark-ai/mcp-server`](./packages/mcp-server) | MCP server for trace debugging in Claude Code, Cursor, and more. |
| [`@agentmark-ai/model-registry`](./packages/model-registry) | Centralized LLM model metadata and pricing. |
| [`create-agentmark`](./packages/create-agentmark) | Project scaffolding tool. |

## Self-host vs Cloud

AgentMark is open-core. The full development loop runs locally with no cloud dependency.

- **Self-hosted (this repo, AGPL-3.0).** CLI, SDK, prompt engine, local trace UI (`agentmark dev`), eval runner, MCP server. Ship to production using only what's in this repo, and forward traces to any OpenTelemetry backend.
- **AgentMark Cloud (hosted, proprietary).** The team layer on top: persistent trace storage, dashboards, collaborative prompt editing, annotations, alerts, and two-way Git sync. Free tier covers most small teams.

If you only need observability and you already have an OTEL backend, the self-hosted setup is enough. Cloud is for teams that want the dashboard, collaboration, and managed trace storage.

## AgentMark Cloud

[AgentMark Cloud](https://app.agentmark.co) adds the team layer:

- Persistent trace storage with search, filtering, and saved views
- Dashboards for cost, latency, and quality metrics
- Collaborative prompt editing with version history
- Annotations and human evaluation workflows
- Alerts for quality regressions, cost spikes, and latency
- Two-way Git sync. Edit prompts in the dashboard, changes land as commits in your repo (and vice versa).

The free tier covers small teams. **[Try Cloud free →](https://app.agentmark.co)**

## Contributing

We welcome contributions. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Community

- **[GitHub Issues](https://github.com/agentmark-ai/agentmark/issues):** bugs and feature requests
- **[GitHub Discussions](https://github.com/agentmark-ai/agentmark/discussions):** questions, ideas, and help
- **[LinkedIn](https://www.linkedin.com/company/agentmark/):** product updates and team posts
- **[Docs](https://docs.agentmark.co):** reference, guides, and tutorials

## License

[GNU Affero General Public License v3.0 or later](./LICENSE.md)
