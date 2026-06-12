# AgentMark Prompt Core

The core prompt engine for [AgentMark](https://github.com/agentmark-ai/agentmark). Parses `.prompt.mdx` files and formats them into a neutral `{ messages, ...config }` shape you hand to whatever LLM SDK you already use — the Vercel AI SDK, the raw OpenAI or Anthropic client, Pydantic AI, or your own bespoke client.

## Installation

```bash
npm install @agentmark-ai/prompt-core
```

## Quick Start

```typescript
import { createAgentMark } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/prompt-core/loader-file";

// Loads prompts pre-built by `agentmark build`
const agentmark = createAgentMark({
  loader: new FileLoader("./dist/agentmark"),
});

const prompt = await agentmark.loadTextPrompt("customer-support.prompt.mdx");
const { messages, ...config } = await prompt.format({
  props: { customer_question: "How long does shipping take?" },
});

// Hand `messages` + `config` to your SDK of choice
```

See the [bring-your-own-SDK guide](https://docs.agentmark.co/integrations/bring-your-own-sdk) for the full integration path.

## API

### `createAgentMark(options)`

Create an AgentMark instance.

```typescript
const agentmark = createAgentMark({
  loader,          // Optional: where prompts load from (file, API, or custom)
  evals,           // Optional: eval functions keyed by name, for experiments
  builtInModels,   // Optional: allowed model names (validates frontmatter model_name)
  templateEngine,  // Optional: custom template engine (defaults to TemplateDX)
});
```

### Loading prompts

One loader method per generation type. Each returns a typed prompt object with a `format()` method:

- **`agentmark.loadTextPrompt(path)`** — text generation (`text_config`)
- **`agentmark.loadObjectPrompt(path)`** — structured output (`object_config`)
- **`agentmark.loadImagePrompt(path)`** — image generation (`image_config`)
- **`agentmark.loadSpeechPrompt(path)`** — speech generation (`speech_config`)

### Loaders

- **`FileLoader`** (`@agentmark-ai/prompt-core/loader-file`) — load prompts pre-built by `agentmark build`. For self-hosted deployments with no runtime API calls.
- **`ApiLoader`** (`@agentmark-ai/prompt-core/loader-api`) — load prompts from AgentMark Cloud or a local `agentmark dev` server.

See [Loaders](https://docs.agentmark.co/configure/loaders).

> The standalone `@agentmark-ai/loader-api` and `@agentmark-ai/loader-file` packages are re-export shims of these subpaths — prefer the subpaths in new code.

### Type safety

Generate types from your prompts with `agentmark generate-types`, then parameterize the instance for end-to-end type-safe props and outputs:

```typescript
import type AgentmarkTypes from "./agentmark.types";

const agentmark = createAgentMark<AgentmarkTypes>({ loader });
```

See [Type safety](https://docs.agentmark.co/configure/type-safety).

## Documentation

Full documentation at [docs.agentmark.co](https://docs.agentmark.co).

## License

[AGPL-3.0-or-later](../../LICENSE.md)
