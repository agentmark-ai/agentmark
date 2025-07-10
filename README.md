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
  <strong>Develop, test, and evalaute your AI Agents using Markdown</strong>
</p>

<p align="center">
  <a href="https://agentmark.co">Homepage</a> |
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.agentmark.co/agentmark/">Docs</a>
</p>

---

**AgentMark makes it easy for developers to develop, test, and evaluate Agents**.

AgentMark makes prompt engineering intuitive by combining familiar Markdown syntax with JSX components, allowing developers to focus on creating reliable Agents. AgentMark seamlessly integrates with your favorite SDK's using our adapters, and currently works in TypeScript and JavaScript, with Python support coming soon.

AgentMark comes with comprehensive tooling included—featuring full type safety, unified prompt configuration, syntax highlighting, loops and conditionals, custom SDK adapters, and support for text, object, image, and speech generation across multiple model providers, even when they don't support native structured output APIs.


## Example Prompt

![AgentMark MDX Example](/assets/agentmark-mdx.png)

_AgentMark prompt file example for generating text_

## Features

| Feature | Description |
|---------|-------------|
| [Multimodal Generation](https://docs.agentmark.co/agentmark/generation_types/overview) | Generate text, objects, images, and speech from a single prompt file, supporting a wide range of model capabilities. |
| [Tools and Agents](https://docs.agentmark.co/agentmark/prompt_basics/tools-and-agents) | Extend prompts with custom tools and agentic workflows, enabling API calls, calculations, and multi-step reasoning. |
| [File Attachments](https://docs.agentmark.co/agentmark/prompt_basics/file-attachments) | Attach images and files to prompts for tasks like image analysis, document processing, and more. |
| [Type Safety](https://docs.agentmark.co/agentmark/running_prompts/type-safety) | Ensure reliable, type-checked inputs and outputs for prompts using JSON Schema and auto-generated TypeScript types. |
| [Conditionals](https://docs.agentmark.co/agentmark/prompt_basics/conditionals), [Loops](https://docs.agentmark.co/agentmark/prompt_basics/loops), [Props](https://docs.agentmark.co/agentmark/prompt_basics/props), [Filter Functions](https://docs.agentmark.co/agentmark/prompt_basics/filter_functions) | Add logic, dynamic data, and transformations to your prompts with powerful JSX-like syntax. |
| [CLI for running/testing](https://docs.agentmark.co/agentmark/running_prompts/cli) | Run, test, and debug prompts directly from the command line or your editor for rapid iteration. |


## Quick Start

### Intialize AgentMark

Get started by first initializing your AgentMark app.

`npx @agentmark/cli init`

### Run Prompts

We offer a few ways to run prompts with AgentMark.

1. Use our AgentMark CLI:

Run `.prompt.mdx` files directly from the command line using our CLI. This is the quickest way to test and execute your prompts.

```bash
# Run a prompt with test props (default)
npx @agentmark/cli run-prompt your-prompt.prompt.mdx

# Run a prompt with a dataset
npx @agentmark/cli run-prompt your-prompt.prompt.mdx -i dataset
```

2. Run AgentMark files with your favorite SDK

AgentMark doesn't support any models or calling any LLM providers. Instead, we format the input of your prompt through an adapter to match the input of the SDK you're using.

| Adapter   | Description |
|-----------|-------------|
| [Vercel (Recommended)](https://docs.agentmark.co/agentmark/getting_started/overview) | The Vercel AI SDK. |
| [Default](https://docs.agentmark.co/agentmark/running_prompts/default)   | Turns prompts into raw JSON, adapt manually to your needs |
| [Custom](https://docs.agentmark.co/agentmark/running_prompts/custom)    | Allows a user to create their own AgentMark adapter to custom adapter format. |
| Mastra (Coming Soon)  | Coming soon, we'll support the Mastra SDK |

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

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/agentmark-ai/agentmark/issues)
- [Discussions](https://github.com/agentmark-ai/agentmark/discussions)

## License

This project is licensed under the [MIT License](https://github.com/agentmark-ai/agentmark/blob/main/LICENSE.md).