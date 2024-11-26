<h1 align="center">PromptDX</h1>

<p align="center">
  <a href="https://github.com/puzzlet-ai">
    <img src="https://www.puzzlet.ai/images/logo.svg" alt="PromptDX Logo" width="200"/>
  </a>
</p>

<p align="center">
  <strong>A declarative, extensible, and composable approach for developing LLM prompts using Markdown and JSX.</strong>
</p>

<p align="center">
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://puzzlet-ai.github.io/promptdx/">Docs</a> |
  <a href="https://github.com/puzzlet-ai/templatedx">TemplateDX</a> |
  <a href="https://puzzlet.ai">Puzzlet</a>
</p>

---

## Overview

PromptDX is a declarative, extensible, and composable approach for developing LLM prompts using Markdown and JSX.

PromptDX is designed to enhance the developer experience for applications built with large language models (LLMs). It allows you to open a PromptDX file and clearly see the exact input being sent to the LLM, while still providing the flexibility to abstract away necessary details.

PromptDX is built on top of the templating language, [TemplateDX](https://github.com/puzzlet-ai/templatedx), and inspired by MDX.

## Getting Started

Below is a basic example to help you get started with PromptDX:

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

PromptDX supports:

1. Markdown: 📝
1. JSX components, props, & plugins: 🧩
1. Unified API across models: 🔗
1. Custom Models: 🛠️
1. Streaming: 🌊
1. Loops, Conditionals, and Filter Functions: ♻️
1. Type Safety: 🛡️

Read our [docs](https://puzzlet-ai.github.io/promptdx) to learn more.

## Models

By default, PromptDX doesn't support any model providers. Instead, support must be added through our plugins.
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
| Groq       | ALL                          | ⚠️ Coming Soon |

Want to add support for another model? Open an [issue](https://github.com/puzzlet-ai/promptdx/issues).

### Custom Model Plugins

Refer to our [docs](https://puzzlet-ai.github.io/promptdx) to learn how to add custom model support.

## Running PromptDX

You can run PromptDX using one of the following methods:

### 1. VSCode Extension

Run .prompt.mdx files directly within your VSCode editor.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.promptdx)

### 2. Webpack Loader

Integrate PromptDX with your webpack workflow using our loader.

[PromptDX Webpack Loader](https://github.com/puzzlet-ai/promptdx-loader)

```tsx
import { runInference, ModelPluginRegistry } from "@puzzlet/promptdx";
import AllModelPlugins from '@puzzlet/promptdx/models/all-latest';
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

Run PromptDX directly in your Node.js environment. Below is a sample implementation:

```tsx node
import { runInference, ModelPluginRegistry, load } from "@puzzlet/promptdx";
import AllModelPlugins from '@puzzlet/promptdx/models/all-latest';

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

We welcome contributions! Please check out our [contribution guidelines](https://github.com/puzzlet-ai/promptdx/blob/main/CONTRIBUTING.md) for more information.

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/puzzlet-ai/promptdx/issues)
- [Discussions](https://github.com/puzzlet-ai/promptdx/discussions)

## License

This project is licensed under the [MIT License](https://github.com/puzzlet-ai/promptdx/blob/main/LICENSE).
