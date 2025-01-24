<h1 align="center">AgentMark</h1>

<p align="center">
  <a href="https://github.com/puzzlet-ai">
    <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://i.imgur.com/xwq74He.png">
      <source media="(prefers-color-scheme: dark)" srcset="https://i.imgur.com/JN9seOy.png">
      <img src="https://i.imgur.com/xwq74He.png" alt="AgentMark Logo" width="200">
    </picture>
  </a>
</p>

<p align="center">
  <strong>The Prompt Engineer's Markdown</strong>
</p>

<p align="center">
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.puzzlet.ai/agentmark/">Docs</a> |
  <a href="https://puzzlet.ai">Puzzlet</a>
</p>

---

## Overview

AgentMark is a declarative, extensible, and composable approach for developing LLM applications using Markdown and JSX. AgentMark files enhance readability by displaying the exact inputs sent to the LLM, while providing lightweight abstractions for developers.

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
1. JSON Output: 📦
1. Tools & Agents: 🕵️
1. Observability: 👀

Read our [docs](https://docs.puzzlet.ai/agentmark/) to learn more.

## Models

By default, AgentMark doesn't support any model providers. Instead, support must be added through our plugins.
Here's a list of currently supported plugins you can start using.

### Built-In Model Plugins

| Provider   | Model                   | Supported      | `@puzzlet/all-models` |
|------------|-------------------------|----------------|---------------------|
| OpenAI     | gpt-4o                  | ✅ Supported   | ✅             |
| OpenAI     | gpt-4o-mini             | ✅ Supported   | ✅             |
| OpenAI     | gpt-4-turbo             | ✅ Supported   | ✅             |
| OpenAI     | gpt-4                   | ✅ Supported    | ✅              |
| OpenAI     | o1-mini                 | ✅ Supported   | ✅             |
| OpenAI     | o1-preview              | ✅ Supported   | ✅             |
| OpenAI     | gpt-3.5-turbo           | ✅ Supported   | ✅             |
| Anthropic  | claude-3-5-haiku-latest | ✅ Supported   | ✅             |
| Anthropic  | claude-3-5-sonnet-latest| ✅ Supported   | ✅             |
| Anthropic  | claude-3-opus-latest    | ✅ Supported   | ✅             |
| Meta       | ALL                     | ✅ Supported   | 🧩 Only          |
| Custom     | any                     | ✅ Supported   | 🧩 Only         |
| Google     | ALL                     | ⚠️ Coming Soon | N/A                 |
| Grok       | ALL                     | ⚠️ Coming Soon | N/A                 |

Want to add support for another model? Open an [issue](https://github.com/puzzlet-ai/agentmark/issues).

### Custom Model Plugins

Refer to our [docs](https://docs.puzzlet.ai/agentmark/) to learn how to add custom model support.

## Language Support

We plan on providing support for AgentMark across a variety of languages.

| Language | Support Status |
|----------|---------------|
| TypeScript | ✅ Supported |
| Python | ⚠️ Coming Soon |
| Java | ⚠️ Coming Soon |
| Others | Need something else? [Open an issue](https://github.com/puzzlet-ai/agentmark/issues) |

## Running AgentMark

You can run AgentMark using any of the following methods:

### 1. VSCode Extension

Run .prompt.mdx files directly within your VSCode editor. Note: You can test props by using `test_settings` in your prompts.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.agentmark)

### 2. FileLoader

Run AgentMark files from your file system. Below is a sample implementation:

```tsx node
import { ModelPluginRegistry, FileLoader, createTemplateRunner } from "@puzzlet/agentmark";
import AllModelPlugins from '@puzzlet/all-models';

// Register models
ModelPluginRegistry.registerAll(AllModelPlugins);

// Create a file loader pointing to your prompts directory
const fileLoader = new FileLoader("./prompts", createTemplateRunner);

const run = async () => {
  // Load a prompt, relative to the file loader's root
  const mathPrompt = await fileLoader.load("math/addition.prompt.mdx");
  
  const props = {
    num1: 5,
    num2: 3
  }
  // Run the prompt
  const result = await mathPrompt.run(props);
  console.log("Run result:", result.result);

  // Compile to see the AgentMark configuration
  const compiled = await mathPrompt.compile(props);
  console.log("Compiled configuration:", compiled);

  // Deserialize to see raw model parameters (i.e. whats sent to the LLM: OpenAI, Anthropic, etc.)
  const deserialized = await mathPrompt.deserialize(props);
  console.log("Model parameters:", deserialized);
}
run();
```

### 3. Puzzlet Integration

Puzzlet is a platform for managing, versioning, and monitoring your LLM prompts in production, with built-in observability, evaluations, and A/B testing capabilities.

```tsx
import { Puzzlet } from '@puzzlet/sdk';
import { ModelPluginRegistry, createTemplateRunner } from "@puzzlet/agentmark";
import AllModelPlugins from '@puzzlet/all-models';

ModelPluginRegistry.registerAll(AllModelPlugins);

const puzzletClient = new Puzzlet({
  apiKey: process.env.PUZZLET_API_KEY!,
  appId: process.env.PUZZLET_APP_ID!,
}, createTemplateRunner);

const run = async () => {
  // Load prompt from Puzzlet instead of local file
  const prompt = await puzzletClient.fetchPrompt('math/addition.prompt.mdx');
  
  // Run the prompt
  const result = await prompt.run({
    num1: 5,
    num2: 3
  });
  console.log(result);

  // Compile the prompt
  const compiled = await prompt.compile({
    num1: 5,
    num2: 3
  });
  console.log(compiled);

  // Deserialize the prompt
  const deserialized = await prompt.deserialize({
    num1: 5,
    num2: 3
  });
  console.log(deserialized);
}
run();
```

## Type Safety

AgentMark & Puzzlet supports automatic type generation from your prompt schemas. Define input (`input_schema`) and output (`schema`) types in your prompt files:

```mdx
---
name: math-addition
metadata:
  model:
    name: gpt-4o
    settings:
      schema:
        type: "object"
        properties:
          sum:
            type: "number"
            description: "The sum of the two numbers"
        required: ["sum"]
input_schema:
  type: "object"
  properties:
    num1:
      type: "number"
      description: "First number to add"
    num2:
      type: "number"
      description: "Second number to add"
  required: ["num1", "num2"]
---

<System>You are a helpful math assistant that performs addition.</System>
```

Then generate types using the CLI:

```bash
# From local files
npx puzzlet generate-types --root-dir ./prompts > puzzlet.types.ts

# From local Puzzlet server
npx puzzlet generate-types --local 9002 > puzzlet.types.ts
```

Use the generated types with FileLoader:

```tsx
import PuzzletTypes from './puzzlet.types';
import { FileLoader, createTemplateRunner } from "@puzzlet/agentmark";

const fileLoader = new FileLoader<PuzzletTypes>("./prompts", createTemplateRunner);

// TypeScript will enforce correct input/output types
const prompt = await fileLoader.load("math/addition.prompt.mdx");
const result = await prompt.run({
  num1: 5,   // Must be number
  num2: 3    // Must be number
});
const sum = result.result.sum;  // type-safe number
```

Or with Puzzlet:

```tsx
import PuzzletTypes from './puzzlet.types';
import { Puzzlet } from '@puzzlet/sdk';

const puzzlet = new Puzzlet<PuzzletTypes>({
  apiKey: process.env.PUZZLET_API_KEY!,
  appId: process.env.PUZZLET_APP_ID!,
}, createTemplateRunner);

// Same type safety as FileLoader
const prompt = await puzzlet.fetchPrompt("math/addition.prompt.mdx");
const result = await prompt.run({
  num1: 5,
  num2: 3
});
const sum = result.result.sum; // type-safe number
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
