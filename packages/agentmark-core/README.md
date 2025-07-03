<h1 align="center">AgentMark</h1>

<p align="center">
  <a href="https://github.com/puzzlet-ai">
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


## Quick Start

Get started with AgentMark using our CLI.

```bash
npx @agentmark/cli@latest init
```

## Generation Types

AgentMark supports:

- Text Generation
- Object Generation
- Image Generation
- Speech/Audio Generation
- Tools/Agents

### Text Generation Example

```jsx text.prompt.mdx
---
name: text
text_config:
  model_name: gpt-4o-mini
---
<User>Tell me a good joke</User>
```

Read more [here](https://docs.agentmark.co/agentmark/generation_types/overview)

### Features

AgentMark supports:

1. Markdown: 📝
1. Syntax highlighting: 🌈
1. Type Safety: 🛡️
1. Unified prompt config: 🔗
1. JSX components, props, & plugins: 🧩
1. Loops, Conditionals, and Filter Functions: ♻️
1. Custom SDK Adapters: 🛠️
1. JSON Output: 📦
1. Tools & Agents: 🕵️
1. Text, Object, Image and Speech generation.📝 🖼 🔊

Read our [docs](https://docs.agentmark.co/agentmark/) to learn more.

## Supported Adapters

By default, AgentMark doesn't support any models or calling any LLM providers. Instead, we format the input of your prompt through an adapter to match the input of the SDK you're using.

| Adapter   | Supported | Supports Type-Safety |
|-----------|-----------|-----------|
| Default   | ✅ | ✅ |
| Custom    | ✅ | ✅ |
| Vercel (Recommended)  | ✅ | ✅ |
| Mastra    | ⚠️ Coming Soon | ⚠️ |

Want to add support for another adapter? Open an [issue](https://github.com/agentmark-ai/agentmark/issues).

## Language Support

We plan on providing support for AgentMark across a variety of languages.

| Language | Support Status |
|----------|---------------|
| TypeScript | ✅ Supported |
| JavaScript | ✅ Supported |
| Python | ⚠️ Coming Soon |
| Others | Need something else? [Open an issue](https://github.com/agentmark-ai/agentmark/issues) |

## Running AgentMark

You can run AgentMark using any of the following methods:

### 1. AgentMark CLI

Run `.prompt.mdx` files directly from the command line using our CLI. This is the quickest way to test and execute your prompts.

```bash
# Run a prompt with test props (default)
npx @agentmark/cli run-prompt your-prompt.prompt.mdx

# Run a prompt with a dataset
npx @agentmark/cli run-prompt your-prompt.prompt.mdx -i dataset
```

The CLI automatically handles:
- API key management (prompts for missing keys)
- All generation types (text, object, image, speech)
- Real-time streaming for text output
- Browser display for images and audio
- Dataset processing with formatted results

### 2. Run AgentMark files with our SDK

Read more about how to run AgentMark files with our SDK [here](https://docs.agentmark.co/agentmark/getting_started/overview).

## Type Safety

AgentMark Studio supports type safety out of the box. Read more about it [here](https://docs.agentmark.co/puzzlet/further_reference/type-safety).

## Contributing

We welcome contributions! Please check out our [contribution guidelines](https://github.com/agentmark-ai/agentmark/blob/main/CONTRIBUTING.md) for more information.

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/agentmark-ai/agentmark/issues)
- [Discussions](https://github.com/agentmark-ai/agentmark/discussions)

## License

This project is licensed under the [MIT License](https://github.com/agentmark-ai/agentmark/blob/main/LICENSE.md).