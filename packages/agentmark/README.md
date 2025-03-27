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
  <strong>Markdown for the AI Era</strong>
</p>

<p align="center">
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.puzzlet.ai/agentmark/">Docs</a> |
  <a href="https://puzzlet.ai">Puzzlet</a>
</p>

---

## Overview

Develop type-safe prompts and agents using readable Markdown and JSX.

### Features

AgentMark supports:

1. Markdown: 📝
1. Type Safety: 🛡️
1. Unified model config: 🔗
1. JSX components, props, & plugins: 🧩
1. Loops, Conditionals, and Filter Functions: ♻️
1. Custom SDK Adapters: 🛠️
1. JSON Output: 📦
1. Tools & Agents: 🕵️
1. Text, Object, and Image output. Audio/Video coming soon.

Read our [docs](https://docs.puzzlet.ai/agentmark/) to learn more.

## Getting Started

Below is a basic example to help you get started with AgentMark:

`example.prompt.mdx`
```mdx
---
name: basic-prompt
model:
  name: gpt-4o-mini
test_settings:
  props:
    num: 3
---

<System>You are a math expert</System>

<User>What's 2 + {props.num}?</User>
```

## Models

By default, AgentMark doesn't support any models or calling any LLM providers. Instead, we format the input of your prompt through an adapter to match the input of the SDK you're using.

### Supported Adapters

| Adapter   | Supported | NPM Package | Supports Type-Safety |
|-----------|-----------|------------|-----------|
| Default   | ✅ | NA (built-in) | ✅ |
| Custom    | ✅ | NA | ✅ |
| Vercel (Recommended)  | ✅ | `@puzzlet/adapter-vercel` | ✅ |
| Mastra    | ⚠️ Coming Soon | Coming Soon | ⚠️ |
| OpenAI Compatible    | ⚠️ Coming Soon | Coming Soon | ❌ |

Want to add support for another adapter? Open an [issue](https://github.com/puzzlet-ai/agentmark/issues).

### Supported Prompt Types

| Prompt Type   | Supported |
|-----------|-----------|
| Object    | ✅ |
| Text    | ✅ |
| Image    | ✅ |
| Audio    | ⚠️ Coming Soon |
| Video    | ⚠️ Coming Soon |

### Custom Adapters

Refer to our [docs](https://docs.puzzlet.ai/agentmark/) to learn how to add custom adapter support.

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

Run .prompt.mdx files directly within your VSCode editor. Note: You can test props by using `test_settings` in your prompts.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.agentmark)

### 2. FileLoader

Run AgentMark files from your file system. Below is a sample implementation using the Vercel adapter to generate an object:

```ts
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark } from "../src";
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';

// Import/Register any Vercel compatible models
const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel(['gpt-4o', 'gpt-4o-mini'], (name: string, options: any) => {
  return openai(name);
});

// Specify a file loader + vercel adapter
const fileLoader = new FileLoader('./puzzlet/templates');
const adapter = new VercelAdapter(modelRegistry);
const agentMark = createAgentMark({
  loader: fileLoader,
  adapter,
});

const prompt = await agentMark.loadObjectPrompt('test/math2.prompt.mdx');
const props = {
  num1: 2,
  num2: 3,
};

// Adapt to the Vercel SDK
const vercelInput = await prompt.format(props);
// Call the Vercel SDK directly
const result2 = await generateObject(vercelInput);
console.log(result2.object);
```

### 3. Puzzlet Integration

Puzzlet is a platform for managing, versioning, and monitoring your LLM prompts in production, with built-in observability, evaluations, prompt management, alerts, and more. 

```ts
// Specify the puzzlet loader instead of file loader
const puzzletLoader = new PuzzletLoader({
  apiKey: process.env.PUZZLET_API_KEY!,
  appId: process.env.PUZZLET_APP_ID!,
  baseUrl: process.env.PUZZLET_BASE_URL!,
});

const agentMark = createAgentMark({
  loader: puzzletLoader,
  // rest stays the same...
});
```

## Type Safety

AgentMark & Puzzlet supports automatic type generation from your prompt schemas. Define input (`input_schema`) and output (`schema`) types in your prompt files:

```mdx
---
name: math-addition
model:
  name: gpt-4o
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
npx @puzzlet/cli generate-types --root-dir ./prompts > puzzlet.types.ts

# From local Puzzlet server
npx @puzzlet/cli generate-types --local 9002 > puzzlet.types.ts
```

Use the generated types with FileLoader:

```ts
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark } from "../src";
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import PuzzletTypes from './puzzlet.types';

const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel(['gpt-4o', 'gpt-4o-mini'], (name: string, options: any) => {
  return openai(name);
});

// Add the puzzlet types
const fileLoader = new FileLoader<PuzzletTypes>('./puzzlet/templates');
const adapter = new VercelAdapter<PuzzletTypes>(modelRegistry);
const agentMark = createAgentMark({
  loader: fileLoader,
  adapter,
});
const prompt = await agentMark.loadObjectPrompt('test/math2.prompt.mdx');
const props = {
  num1: 2,
  num2: 3,
};

const vercelInput = await prompt.format(props);
const result2 = await generateObject(vercelInput);
// Type safety will enforce that the sum is a number
console.log(result2.object.sum);
```

Or with Puzzlet:

```ts
// ...
const puzzletLoader = new PuzzletLoader<PuzzletTypes>({
  apiKey: process.env.PUZZLET_API_KEY!,
  appId: process.env.PUZZLET_APP_ID!,
  baseUrl: process.env.PUZZLET_BASE_URL!,
});
// Rest stays the same...
```

AgentMark is also type-safe within markdown files. Read more [here](https://puzzlet-ai.github.io/templatedx/docs/type-safety).

## Contributing

We welcome contributions! Please check out our [contribution guidelines](https://github.com/puzzlet-ai/agentmark/blob/main/CONTRIBUTING.md) for more information.

## Community

Join our community to collaborate, ask questions, and stay updated:

- [Discord](https://discord.gg/P2NeMDtXar)
- [Issues](https://github.com/puzzlet-ai/agentmark/issues)
- [Discussions](https://github.com/puzzlet-ai/agentmark/discussions)

## License

This project is licensed under the [MIT License](https://github.com/puzzlet-ai/agentmark/blob/main/LICENSE).