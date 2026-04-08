<h1 align="center">AgentMark</h1>

<p align="center">
  <a href="https://github.com/agentmark-ai">
    <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://i.imgur.com/j7nNMip.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://i.imgur.com/j7nNMip.png">
      <img src="https://i.imgur.com/j7nNMip.png" alt="AgentMark Logo" width="200">
    </picture>
  </a>
</p>

<p align="center">
  <strong>The open-source platform to develop, test, and observe your AI agents.</strong>
</p>

<p align="center">
  <a href="https://www.agentmark.co">Homepage</a> |
  <a href="https://docs.agentmark.co/agentmark/">Docs</a>
</p>

---

AgentMark is a complete platform for building reliable AI agents. Define prompts in Markdown, run them with any SDK, evaluate quality with datasets, and trace every call in production.

**Prompt management** &mdash; Write prompts as `.prompt.mdx` files with type-safe inputs, tool definitions, structured outputs, conditionals, loops, and reusable components.

**Observability** &mdash; Trace every LLM call with OpenTelemetry. View traces locally or forward them to AgentMark Cloud for dashboards, alerts, and collaboration.

**Evaluations** &mdash; Test prompts against datasets with built-in evals. Run experiments from the CLI and gate deployments on quality thresholds.

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

That's it. The prompt is version-controlled, type-checked, and traceable.

## Quick Start

```bash
# Scaffold a new project (interactive — picks your language and adapter)
npm create agentmark@latest

# Start the dev server (API + trace UI + hot reload)
agentmark dev

# Run a single prompt
agentmark run-prompt my-prompt.prompt.mdx

# Run an experiment against a dataset
agentmark run-experiment my-prompt.prompt.mdx
```

## Features

| Feature | Description |
|---------|-------------|
| [Multimodal Generation](https://docs.agentmark.co/agentmark/generation_types/overview) | Generate text, structured objects, images, and speech from a single prompt file. |
| [Tools and Agents](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents) | Define tools inline and build agentic loops with `max_calls`. |
| [Structured Output](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents) | Type-safe JSON output via JSON Schema definitions. |
| [Datasets & Evals](https://docs.agentmark.co/agentmark/datasets/overview) | Test prompts against JSONL datasets with built-in and custom evaluators. |
| [Tracing](https://docs.agentmark.co/agentmark/running_prompts/cli) | OpenTelemetry-based tracing for every LLM call — local and cloud. |
| [Type Safety](https://docs.agentmark.co/agentmark/running_prompts/type-safety) | Auto-generate TypeScript types from your prompts. JSON Schema validation in your IDE. |
| [Reusable Components](https://docs.agentmark.co/agentmark/prompt_basics/reusable-components) | Import and compose prompt fragments across files. |
| [Conditionals & Loops](https://docs.agentmark.co/agentmark/prompt_basics/conditionals) | Dynamic prompts with `<If>`, `<ForEach>`, props, and filter functions. |
| [File Attachments](https://docs.agentmark.co/agentmark/prompt_basics/file-attachments) | Attach images and documents for vision and document processing tasks. |
| [MCP Servers](https://docs.agentmark.co/agentmark/prompt_basics/mcp) | Call Model Context Protocol tools directly from prompts. |
| [MCP Trace Server](https://www.npmjs.com/package/@agentmark-ai/mcp-server) | Debug traces from Claude Code, Cursor, or any MCP client. |

## SDK Adapters

AgentMark doesn't call LLM APIs directly. Instead, adapters format your prompt for the SDK you already use.

| Adapter | Language | Package |
|---------|----------|---------|
| [Vercel AI SDK v5](https://docs.agentmark.co/agentmark/running_prompts/vercel) | TypeScript | `@agentmark-ai/ai-sdk-v5-adapter` |
| [Vercel AI SDK v4](https://docs.agentmark.co/agentmark/running_prompts/vercel) | TypeScript | `@agentmark-ai/ai-sdk-v4-adapter` |
| [Mastra](https://docs.agentmark.co/agentmark/running_prompts/mastra) | TypeScript | `@agentmark-ai/mastra-v0-adapter` |
| [Claude Agent SDK](https://docs.agentmark.co/agentmark/running_prompts/claude-agent-sdk) | TypeScript | `@agentmark-ai/claude-agent-sdk-v0-adapter` |
| [Claude Agent SDK](https://docs.agentmark.co/agentmark/running_prompts/claude-agent-sdk) | Python | `agentmark-claude-agent-sdk-v0` |
| [Pydantic AI](https://docs.agentmark.co/agentmark/running_prompts/pydantic-ai) | Python | `agentmark-pydantic-ai` |
| [Fallback](https://docs.agentmark.co/agentmark/running_prompts/default) | TypeScript | `@agentmark-ai/fallback-adapter` |

Want another adapter? [Open an issue](https://github.com/agentmark-ai/agentmark/issues).

## Language Support

| Language | Status |
|----------|--------|
| TypeScript / JavaScript | Supported |
| Python | Supported |
| Others | [Open an issue](https://github.com/agentmark-ai/agentmark/issues) |

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

## Examples

See the [`examples/`](./examples) directory for complete, runnable examples:

- **[Hello World](./examples/01-hello-world)** — Simplest possible prompt
- **[Structured Output](./examples/02-structured-output)** — Extract typed JSON with a schema
- **[Tool Use](./examples/03-tool-use)** — Agent with tool calling
- **[Reusable Components](./examples/04-reusable-components)** — Import and compose prompts
- **[Evaluations](./examples/05-evaluations)** — Test prompts against datasets
- **[Production Tracing](./examples/06-production-tracing)** — Trace LLM calls with the SDK

## Cloud Platform

[AgentMark Cloud](https://agentmark.co) extends the open-source project with:

- Collaborative prompt editing and version history
- Persistent trace storage with search and filtering
- Dashboards for cost, latency, and quality metrics
- Annotations and human evaluation workflows
- Alerts for quality regressions, cost spikes, and latency
- Two-way Git sync

## Contributing

We welcome contributions! See our [contribution guidelines](./CONTRIBUTING.md).

## Community

- [GitHub Issues](https://github.com/agentmark-ai/agentmark/issues)

## License

[MIT License](./LICENSE.md)
