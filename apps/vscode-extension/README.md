# AgentMark

**A declarative, extensible, and composable approach for creating LLM prompts using Markdown and JSX.**

![AgentMark](https://camo.githubusercontent.com/dd099c983ee24dafbebc4e8f04cc8f2afa75380db9ece1c4847391e5b46d20af/68747470733a2f2f692e696d6775722e636f6d2f6a376e4e4d69702e706e67)

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

1. Open Visual Studio Code.
2. Navigate to your `.prompt.mdx` prompt
3. Copy this, or create your own.
4. Press F5 or click the "Run" button in VS Code to launch the extension.

AgentMark supports multiple types of generation:

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

## Modules

You can import `.md` or `.mdx` file within your files.

```mdx Imports
---
name: basic-prompt
text_config:
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
text_config:
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

Comprehensive documentation, including guides and API references, is available in the [AgentMark GitHub repository](https://github.com/agentmark-ai/agentmark/). Refer to the documentation for detailed instructions on using AgentMark features and integrating it with your workflow.

## Community

Chat with our growing, tight-knit community. Join our [Discord](https://discord.gg/P2NeMDtXar)

## Feedback

We value your feedback to continuously improve AgentMark. Please submit any issues, feature requests, or other feedback through the [GitHub repository's issue tracker](https://github.com/agenmark-ai/agentmark/issues).