<h1 align="center">AgentMark</h1>

<p align="center">
  <a href="https://github.com/puzzlet-ai">
    <img src="/docs/static/img/agent-mark.svg" alt="AgentMark Logo" width="200"/>
  </a>
</p>

<p align="center">
  <strong>A declarative, extensible, and composable approach for developing LLM prompts using Markdown and JSX.</strong>
</p>

<p align="center">
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://puzzlet-ai.github.io/agentmark/">Docs</a> |
  <a href="https://github.com/puzzlet-ai/templatedx">TemplateDX</a> |
  <a href="https://puzzlet.ai">Puzzlet</a>
</p>

---

## Overview

AgentMark is a declarative, extensible, and composable approach for developing LLM prompts using Markdown and JSX.

AgentMark is designed to enhance the developer experience for applications built with large language models (LLMs). It allows you to open a AgentMark file and clearly see the exact input being sent to the LLM, while still providing the flexibility to abstract away necessary details.

AgentMark is built on top of the templating language, [TemplateDX](https://github.com/puzzlet-ai/templatedx), and inspired by MDX.

## Getting Started

Below is a basic example to help you get started with AgentMark:

`example.prompt.mdx`
```mdx
---
name: basic-prompt
metadata:
  model:
    name: gpt-4o-mini
test_settings:
  props:
    num: 3
---

<System>You are a math expert</System>

<User>What's 2 + {props.num}?</User>
```

## Features

AgentMark supports:

1. Markdown: 📝
1. JSX components, props, & plugins: 🧩
1. Unified model config: 🔗
1. Custom Models: 🛠️
1. Streaming: 🌊
1. Loops, Conditionals, and Filter Functions: ♻️
1. Type Safety: 🛡️
1. Agents: 

Read our [docs](https://puzzlet-ai.github.io/agentmark) to learn more.

## Models

By default, AgentMark doesn't support any model providers. Instead, support must be added through our plugins.
Here's a list of currently supported plugins you can start using.

### Built-In Model Plugins

| Provider   | Model                        | Supported      |
|------------|------------------------------|----------------|
| OpenAI     | gpt-4o                       | ✅ Supported   |
| OpenAI     | gpt-4o-mini                  | ✅ Supported   |
| OpenAI     | gpt-4-turbo                  | ✅ Supported   |
| OpenAI     | gpt-4                        | ✅ Supported   |
| OpenAI     | o1-mini                      | ✅ Supported   |
| OpenAI     | o1-preview                   | ✅ Supported   |
| OpenAI     | gpt-3.5-turbo                | ✅ Supported   |
| Anthropic  | claude-3-5-haiku-latest      | ✅ Supported   |
| Anthropic  | claude-3-5-sonnet-latest     | ✅ Supported   |
| Anthropic  | claude-3-opus-latest         | ✅ Supported   |
| Custom     | any                          | ✅ Supported   |
| Google     | ALL                          | ⚠️ Coming Soon |
| Meta       | ALL                          | ⚠️ Coming Soon |
| Grok       | ALL                          | ⚠️ Coming Soon |

Want to add support for another model? Open an [issue](https://github.com/puzzlet-ai/agentmark/issues).

### Custom Model Plugins

Refer to our [docs](https://puzzlet-ai.github.io/agentmark) to learn how to add custom model support.

## Running AgentMark

You can run AgentMark using one of the following methods:

### 1. VSCode Extension

Run .prompt.mdx files directly within your VSCode editor.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.agentmark)

### 2. Webpack Loader

Integrate AgentMark with your webpack workflow using our loader.

[AgentMark Webpack Loader](https://github.com/puzzlet-ai/agentmark-loader)

```tsx
import { runInference, ModelPluginRegistry } from "@puzzlet/agentmark";
import AllModelPlugins from '@puzzlet/all-models';
import MyPrompt from './example.prompt.mdx';

// Note: Registering all latest models for demo/development purposes. 
// In production, you'll likely want to selectively load these, and pin models.
ModelPluginRegistry.registerAll(AllModelPlugins);

const run = async () => {
  const props = { name: "Emily" };
  const result = await runInference(MyPrompt, props);
  console.log(result)
}
run();
```

### 3. Node.js

Run AgentMark directly in your Node.js environment. Below is a sample implementation:

```tsx node
import { runInference, ModelPluginRegistry, load } from "@puzzlet/agentmark";
import AllModelPlugins from '@puzzlet/all-models';

// Note: Registering all latest models for demo/development purposes. 
// In production, you'll likely want to selectively load these, and pin models.
ModelPluginRegistry.registerAll(AllModelPlugins);

const run = async () => {
  const props = { name: "Emily" };
  const Prompt = await load('./example.prompt.mdx');
  const result = await runInference(Prompt, props);
  console.log(result);
}
run();
```

## Contributing

We welcome contributions! Please check out our [contribution guidelines](https://github.com/puzzlet-ai/agentmark/blob/main/CONTRIBUTING.md) for more information.

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/puzzlet-ai/agentmark/issues)
- [Discussions](https://github.com/puzzlet-ai/agentmark/discussions)

## License

This project is licensed under the [MIT License](https://github.com/puzzlet-ai/agentmark/blob/main/LICENSE).
