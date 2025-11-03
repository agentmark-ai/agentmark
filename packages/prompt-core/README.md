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
  <strong>Markdown for the AI Era. Develop, test, and evalaute your AI Agents.</strong>
</p>

<p align="center">
  <a href="https://www.agentmark.co">Homepage</a> |
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.agentmark.co/agentmark/">Docs</a>
</p>

---

**AgentMark makes it easy for developers to develop, test, and evaluate Agents**.

![AgentMark MDX Example](/assets/agentmark.png)

## Features

| Feature | Description |
|---------|-------------|
| [Multimodal Generation](https://docs.agentmark.co/agentmark/generation_types/overview) | Generate text, objects, images, and speech from a single prompt file, supporting a wide range of model capabilities. |
| [Datasets](https://docs.agentmark.co/agentmark/datasets/overview) | Create a collection of inputs and expected outputs to test your prompts and agents in readable JSONL format. |
| [Evals](https://docs.agentmark.co/agentmark/testing/evals) | Assess the quality/output of your prompts with our eval support |
| [CLI](https://docs.agentmark.co/agentmark/running_prompts/cli) | Run prompts and experiments directly from the command line or your editor for rapid iteration. |
| [Tools and Agents](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents) | Extend prompts with custom tools and agentic workflows. |
| [JSON Output](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents) | AgentMark supports structured Object/JSON output through JSON Schema definitions. |
| [File Attachments](https://docs.agentmark.co/agentmark/prompt_basics/file-attachments) | Attach images and files to prompts for tasks like image analysis, document processing, and more. |
| [Type Safety](https://docs.agentmark.co/agentmark/running_prompts/type-safety) | Ensure reliable, type-checked inputs and outputs for prompts using JSON Schema and auto-generated TypeScript types. |
| [Reusable Components](https://docs.agentmark.co/agentmark/prompt_basics/reusable-components) | Import and reuse components across your prompts.|
| [Conditionals](https://docs.agentmark.co/agentmark/prompt_basics/conditionals), [Loops](https://docs.agentmark.co/agentmark/prompt_basics/loops), [Props](https://docs.agentmark.co/agentmark/prompt_basics/props), [Filter Functions](https://docs.agentmark.co/agentmark/prompt_basics/filter_functions) | Add logic, dynamic data, and transformations to your prompts with powerful JSX-like syntax. |
| [MCP Servers](https://docs.agentmark.co/agentmark/prompt_basics/mcp) | AgentMark supports calling Model Context Protocol (MCP) tools directly from your prompts. | 

## Quick Start

### Intialize AgentMark

Get started by first initializing your AgentMark app.

Install:
`npm create agentmark@latest`

### Run Prompts

We offer a few ways to run prompts with AgentMark.

1. Use our AgentMark CLI:

Run `.prompt.mdx` files directly from the command line using our CLI. This is the quickest way to test and execute your prompts.

```bash
# Run a prompt with test props (default)
agentmark run-prompt your-prompt.prompt.mdx

# Run a prompt with a dataset
agentmark run-experiment your-prompt.prompt.mdx
```

2. Run AgentMark files with your favorite SDK

AgentMark doesn't support any models or calling any LLM providers. Instead, we format the input of your prompt through an adapter to match the input of the SDK you're using.

| Adapter   | Description |
|-----------|-------------|
| [Vercel](https://docs.agentmark.co/agentmark/running_prompts/vercel) | The Vercel AI SDK. |
| [Mastra](https://docs.agentmark.co/agentmark/running_prompts/mastra) | The Mastra SDK |
| [LlamaIndex](https://docs.agentmark.co/agentmark/running_prompts/llamaindex) | The LLamaIndex SDK |
| [Fallback](https://docs.agentmark.co/agentmark/running_prompts/fallback)   | Turns prompts into raw JSON, adapt manually to your needs |

Want to add support for another adapter? Open an [issue](https://github.com/agentmark-ai/agentmark/issues).

## Language Support

We plan on providing support for AgentMark across a variety of languages.

| Language | Support Status |
|----------|---------------|
| TypeScript | ✅ Supported |
| JavaScript | ✅ Supported |
| Python | ⚠️ Coming Soon |
| Others | Need something else? [Open an issue](https://github.com/agentmark-ai/agentmark/issues) |

## Type Safety

AgentMark Studio supports type safety out of the box. Read more about it [here](https://docs.agentmark.co/platform/further_reference/type-safety).

## Contributing

We welcome contributions! Please check out our [contribution guidelines](https://github.com/agentmark-ai/agentmark/blob/main/CONTRIBUTING.md) for more information.

## Cloud Platform

[AgentMark Cloud](agentmark.co) extends this OSS project, and allows you to:

1. Collaborate with teammates on prompts and datasets
2. Run experiments
3. Persist your telemetry data
4. Annotate and evaluate your data
5. Setup alerts for quality, latency, cost, and more
6. View high-level metrics for your agents
7. Setup two-way syncing with your Git repo

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/agentmark-ai/agentmark/issues)

## License

This project is licensed under the [MIT License](https://github.com/agentmark-ai/agentmark/blob/main/LICENSE.md).