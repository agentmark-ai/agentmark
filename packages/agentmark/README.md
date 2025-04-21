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
  <strong>Markdown for the AI Era</strong>
</p>

<p align="center">
  <a href="https://agentmark.co">Homepage</a>
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.puzzlet.ai/agentmark/">Docs</a> |
</p>

---

## Overview

Type-safe prompts and evals for the AI Era.

### Features

AgentMark supports:

1. Markdown: 📝
1. Type Safety: 🛡️
1. Unified prompt config: 🔗
1. JSX components, props, & plugins: 🧩
1. Loops, Conditionals, and Filter Functions: ♻️
1. Custom SDK Adapters: 🛠️
1. JSON Output: 📦
1. Tools & Agents: 🕵️
1. Text, Object, and Image generation. Audio/Video coming soon. 📝 🖼 🔊

Read our [docs](https://docs.puzzlet.ai/agentmark/) to learn more.

## Quick Start

Get started with AgentMark in just 3 steps:

1. Initialize AgentMark in your project:
```bash
npx @agentmark/cli@latest init
```

2. Start with npm:
```bash
npm start
```

Or with yarn:
```bash
yarn start
```

3. Run tests with npm:
```bash
npm test
```

or with yarn:

```bash
yarn test
```

4. (Optional) Generate types:
```bash
npx @agentmark/cli@latest generate-types
```

## Models

By default, AgentMark doesn't support any models or calling any LLM providers. Instead, we format the input of your prompt through an adapter to match the input of the SDK you're using.

### Supported Adapters

| Adapter   | Supported | Supports Type-Safety |
|-----------|-----------|-----------|
| Default   | ✅ | ✅ |
| Custom    | ✅ | ✅ |
| Vercel (Recommended)  | ✅ | ✅ |
| Mastra    | ⚠️ Coming Soon | ⚠️ |
| LangChain  | ⚠️ Coming Soon | ❌ |
| OpenAI Compatible    | ⚠️ Coming Soon | ❌ |

Want to add support for another adapter? Open an [issue](https://github.com/puzzlet-ai/agentmark/issues).

## Language Support

We plan on providing support for AgentMark across a variety of languages.

| Language | Support Status |
|----------|---------------|
| TypeScript | ✅ Supported |
| JavaScript | ✅ Supported |
| Python | ⚠️ Coming Soon |
| Others | Need something else? [Open an issue](https://github.com/puzzlet-ai/agentmark/issues) |

## Running AgentMark

You can run AgentMark using any of the following methods:

### 1. VSCode Extension

Run `.prompt.mdx` files directly within your VSCode editor. Note: You can test props by using `test_settings` in your prompts. This is useful for iterating on prompts quickly.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.agentmark)

### 2. SDK w/ Local File Loader

You can

### 3. SDK w/ AgentMark Studio Loader

AgentMark Studio is a platform for managing, versioning, and monitoring your LLM prompts in production, with built-in observability, evaluations, prompt management, alerts, and more. 

```ts
// Specify the puzzlet loader instead of file loader
const studioLoader = new StudioLoader({
  apiKey: process.env.PUZZLET_API_KEY!,
  appId: process.env.PUZZLET_APP_ID!,
  baseUrl: process.env.PUZZLET_BASE_URL!,
});

const agentMark = createAgentMark({
  loader: studioLoader,
  // rest stays the same...
});
```

## Type Safety

AgentMark Studio supports type safety out of the box. Read more about it [here](https://docs.puzzlet.ai/agentmark/type-safety/).

## Contributing

We welcome contributions! Please check out our [contribution guidelines](https://github.com/agentmark-ai/agentmark/blob/main/CONTRIBUTING.md) for more information.

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/agentmark-ai/agentmark/issues)
- [Discussions](https://github.com/agentmark-ai/agentmark/discussions)

## License

This project is licensed under the [MIT License](https://github.com/agentmark-ai/agentmark/blob/main/LICENSE).