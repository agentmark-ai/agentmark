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
  <a href="https://agentmark.co">Homepage</a> |
  <a href="https://discord.gg/P2NeMDtXar">Discord</a> |
  <a href="https://docs.agentmark.co/agentmark/">Docs</a>
</p>

---

**AgentMark is a readable, markdown-based prompting language for building reliable AI applications and agents**.

AgentMark makes prompt engineering intuitive by combining familiar Markdown syntax with JSX components, allowing developers to focus on crafting effective prompts rather than wrestling with complex APIs, or learning a new syntax. You don't need to rewrite your entire application in AgentMark, just your prompts! AgentMark seamlessly integrates with your existing codebase in TypeScript and JavaScript, with Python support coming soon.

AgentMark comes with comprehensive tooling included—featuring full type safety, unified prompt configuration, syntax highlighting, loops and conditionals, custom SDK adapters, and support for text, object, image, and speech generation across multiple model providers, even when they don't support native structured output APIs.

## Generation Types

### Text Generation

```jsx text.prompt.mdx
---
name: text
text_config:
  model_name: gpt-4o-mini
---
<User>Tell me a good joke</User>
```

![Text](https://i.imgur.com/nDsCxit.png)

### Object Generation

```jsx object.prompt.mdx
---
name: example
object_config:
  model_name: gpt-4
  temperature: 0.5
  schema:
    type: object
    properties:
      event:
        type: object
        properties:
          date:
            type: string
            description: The date of the event
          attendees:
            type: array
            items:
              type: object
              properties:
                name:
                  type: string
                  description: The name of the attendee
                role:
                  type: string
                  description: The role of the attendee
              required:
                - name
                - role
        required: 
          - date
          - attendees
---

<System>Parse event details from the text.</System>
<User>The company picnic is on July 15th. John (host) and Mary (coordinator) are organizing it</User>
```

![Object](https://i.imgur.com/m9VPY9v.png)

### Image Generation

```jsx image.prompt.mdx
---
name: image
image_config:
  model_name: dall-e-3
  num_images: 2
  size: 1024x1024
  aspect_ratio: 1:1
  seed: 12345
---

<ImagePrompt>
Cute cats playing
</ImagePrompt>
```

![Img](https://i.imgur.com/Coq6Ody.png)

### Speech Generation

```jsx speach.prompt.mdx
---
name: speech
speech_config:
  model_name: tts-1-hd
  voice: "nova"
  speed: 1.0
  output_format: "mp3"
---

<System>
Please read this text aloud.
</System>

<SpeechPrompt>
This is a test for the speech prompt to be spoken aloud.
</SpeechPrompt>
```

![Audio](https://i.imgur.com/ovOZUNE.png)

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

## Quick Start

Get started with AgentMark using our CLI.


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

### 2. VSCode Extension

Run `.prompt.mdx` files directly within your VSCode editor. Note: You can test props by using `test_settings` in your prompts. This is useful for iterating on prompts quickly.

[Download the VSCode Extension](https://marketplace.visualstudio.com/items?itemName=agentmark.agentmark)

### 3. Run AgentMark files with our SDK

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