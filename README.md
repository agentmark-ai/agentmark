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
  <a href="https://promptdx.puzzlet.ai">Docs</a> |
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

```mdx example.prompt.mdx
---
name: basic-prompt
metadata:
  model:
    name: gpt-4o-mini
test_settings:
  props:
    num: 3
---
import Instructions from './instructions.mdx';

<System>
  You are a math expert
  <Instructions outputType="latex" />
</System>

<User>
  What's 2 + {props.num}?
</User>
```

## Features

PromptDX supports:

1. Markdown
2. Components
3. Custom models
4. Custom filters
6. Custom JSX tags
7. Loops and Conditional

Read our [docs](https://puzzlet-ai.github.io/promptdx) to learn more.

## Running PromptDX

You can run PromptDX using one of the following methods:

### 1. VSCode Extension

Run .prompt.mdx files directly within your VSCode editor.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=puzzlet.promptdx)

### 2. Webpack Loader

Integrate PromptDX with your webpack workflow using our loader.

[PromptDX Webpack Loader](https://github.com/puzzlet-ai/promptdx-loader)

### 3. Node.js

Run PromptDX directly in your Node.js environment. Below is a sample implementation:

```tsx node
import { runInference, parse } from "@puzzlet/promptdx";

const getMdxFile: ContentLoader = async (path: string) => {
  const input = fs.readFileSync(path, 'utf-8');
  return input;
}

const run = async (path: string) => {
  const mdx = await getMdxFile(path);
  const bundled = await parse(mdx, `${basePathToMdxFile}`, getMdxFile);
  const props = { name: "Emily" };
  const result = await runInference(bundled, myProps);
}
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
