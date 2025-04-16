# AgentMark

**A declarative, extensible, and composable approach for creating LLM prompts using Markdown and JSX.**

![AgentMark](https://i.imgur.com/xwq74He.png)

## Overview

AgentMark is a Visual Studio Code extension that brings a new, powerful way to create language model (LLM) prompts. Designed with a focus on readability, portability, and syntax highlighting, AgentMark allows you to write prompts in a language-agnostic, declarative format using `.prompt.mdx` files.

By leveraging Markdown and JSX, AgentMark provides a clean, composable, and extensible solution to enhance your prompt development workflow.

## Features

- **Language Agnostic**: Write prompts for any language model without platform or syntax constraints.
- **Composable**: Easily modularize and reuse prompt components across different files and projects.
- **Readable**: Promotes a declarative structure that enhances readability and maintainability.
- **Syntax Highlighting**: Enjoy rich syntax highlighting to improve development experience in `.prompt.mdx` files.
- **Portable**: Share and transfer prompts seamlessly across different environments.
- **Type Safety**: TS-style Type Safety out of the box

## Running the Extension

```mdx Basic Prompt
---
name: basic-prompt
object_config:
  model_name: gpt-4o-mini
---

<User>What's 2 + 2?</User>
```

1. Open Visual Studio Code.
2. Navigate to your `.prompt.mdx` prompt
3. Copy this, or create your own.
4. Press F5 or click the "Run" button in VS Code to launch the extension.

## Modules

You can import `.md` or `.mdx` file within your files.

```mdx Imports
---
name: basic-prompt
object_config:
  model_name: gpt-4o-mini
---

import OutputInstructions from './output-format.mdx';

<User>
  What's 2 + 2?

  <OutputInstructions />
</User>
```

## Props

Props can be accessed using `{props.varName}`. You can test props in your file config through the `test_settings`.

```mdx Props
---
name: basic-prompt
object_config:
  model_name: gpt-4o-mini
test_settings:
  props:
    num: 3
---

<User>
  What's 2 + {props.num}?
</User>
```

## Documentation

Comprehensive documentation, including guides and API references, is available in the [AgentMark GitHub repository](https://github.com/puzzlet-ai/agentmark/). Refer to the documentation for detailed instructions on using AgentMark features and integrating it with your workflow.

## Community

Chat with our growing, tight-knit community. Join our [Discord](https://discord.gg/P2NeMDtXar)

## Feedback

We value your feedback to continuously improve AgentMark. Please submit any issues, feature requests, or other feedback through the [GitHub repository's issue tracker](https://github.com/puzzlet-ai/agentmark/issues).