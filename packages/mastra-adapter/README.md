# @agentmark/mastra-adapter

A powerful adapter that bridges AgentMark prompts with the Mastra AI agent framework, enabling seamless integration between AgentMark's declarative prompt format and Mastra's agent architecture.

## 🚀 Features

- **🔄 Full Modality Support**: Text, Object, Image, and Speech prompt types
- **🛡️ Type Safety**: Complete TypeScript support with proper type inference
- **⚙️ Runtime Configuration**: Dynamic API keys, telemetry, and custom options
- **🔧 Flexible Model Registry**: Pattern matching and multiple model support
- **🎯 Tool Integration**: Support for custom tools and function calling
- **📊 Telemetry Support**: Built-in observability and monitoring
- **🏗️ Clean Architecture**: Follows AgentMark adapter patterns

## 📦 Installation

```bash
npm install @agentmark/mastra-adapter @mastra/core @ai-sdk/openai
```

## 🎯 Quick Start

```typescript
import { FileLoader } from "@agentmark/agentmark-core";
import { 
  createAgentMarkClient, 
  MastraModelRegistry 
} from "@agentmark/mastra-adapter";
import { Agent } from "@mastra/core";
import { openai } from "@ai-sdk/openai";

// Define your prompt types
type MyPrompts = {
  "math.prompt.mdx": {
    input: { problem: string };
    output: { answer: string; steps: string[] };
  };
};

// Create a model registry
const modelRegistry = new MastraModelRegistry();
modelRegistry.registerModels("gpt-4o-mini", (name, config, options) => {
  return new Agent({
    name,
    instructions: config.instructions || "You are a helpful assistant.",
    model: openai("gpt-4o-mini"),
    ...options,
  });
});

// Create AgentMark client with Mastra adapter
const agentMark = createAgentMarkClient<MyPrompts>({
  loader: new FileLoader("./prompts"),
  modelRegistry,
});

// Use your prompts
const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
const result = await mathPrompt.format({
  props: { problem: "What is 2 + 2?" }
});

console.log(result.output); // Zod schema for type-safe responses
console.log(result.messages); // Formatted messages for Mastra
```

## 📋 Supported Prompt Types

### Object Prompts

Generate structured responses with type-safe schemas:

```yaml
---
name: math-solver
object_config:
  model_name: gpt-4o-mini
  temperature: 0.1
  schema:
    type: object
    properties:
      answer: { type: string }
      confidence: { type: number }
---
```

### Text Prompts

Generate natural language responses:

```yaml
---
name: creative-writer
text_config:
  model_name: gpt-4o-mini
  temperature: 0.8
  max_tokens: 500
---
```

### Image Prompts

Generate images with detailed prompts:

```yaml
---
name: image-generator
image_config:
  model_name: dall-e-3
  prompt: "A {props.style} image of {props.subject}"
  size: "1024x1024"
---
```

### Speech Prompts

Convert text to speech:

```yaml
---
name: speech-narrator
speech_config:
  model_name: tts-1
  text: "{props.message}"
  voice: "nova"
---
```

## 🔧 Model Registry

The `MastraModelRegistry` provides flexible model management:

```typescript
const registry = new MastraModelRegistry();

// Register single model
registry.registerModels("gpt-4", createAgent);

// Register multiple models
registry.registerModels(["gpt-4", "gpt-3.5-turbo"], createAgent);

// Register with pattern matching
registry.registerModels(/^gpt-.*/, createAgent);

// Set default creator
registry.setDefaultCreator(createAgent);
```

## 🛠️ Tool Integration

Support for custom tools and function calling:

```typescript
// Define tools in your prompt
---
name: calculator
text_config:
  model_name: gpt-4o-mini
  tools:
    add:
      description: "Add two numbers"
      parameters:
        type: object
        properties:
          a: { type: number }
          b: { type: number }
---

// Register tool implementations
const toolRegistry = new MastraToolRegistry()
  .register("add", async ({ a, b }) => a + b);

const agentMark = createAgentMarkClient({
  loader,
  modelRegistry,
  toolRegistry,
});
```

## ⚙️ Runtime Configuration

Dynamic configuration and telemetry:

```typescript
const result = await prompt.format({
  props: { message: "Hello" },
  // Runtime configuration
  apiKey: "custom-api-key",
  telemetry: {
    isEnabled: true,
    functionId: "my-function",
    metadata: { userId: "123" }
  }
});
```

## 🔍 Type Safety

Full TypeScript support with proper type inference:

```typescript
type Prompts = {
  "math.prompt.mdx": {
    input: { problem: string };
    output: { answer: string; steps: string[] };
  };
};

const client = createAgentMarkClient<Prompts>({...});

// TypeScript knows this returns MastraObjectParams<{ answer: string; steps: string[] }>
const mathPrompt = await client.loadObjectPrompt("math.prompt.mdx");

// Full type safety on props
const result = await mathPrompt.format({
  props: { problem: "2 + 2" } // ✅ Type-safe
  // props: { question: "2 + 2" } // ❌ TypeScript error
});
```

## 🧪 Testing

The adapter includes comprehensive tests:

```bash
npm test
```

Test features include:
- ✅ All prompt type adaptations
- ✅ Model registry functionality  
- ✅ Tool integration
- ✅ Runtime configuration
- ✅ Error handling
- ✅ Type safety validation

## 📚 API Reference

### `MastraAdapter`

Core adapter class that converts AgentMark prompts to Mastra format.

```typescript
class MastraAdapter<T, R> {
  adaptText(input: TextConfig, options: AdaptOptions, metadata: PromptMetadata): MastraTextParams
  adaptObject(input: ObjectConfig, options: AdaptOptions, metadata: PromptMetadata): MastraObjectParams<T>
  adaptImage(input: ImageConfig, options: AdaptOptions): MastraImageParams
  adaptSpeech(input: SpeechConfig, options: AdaptOptions): MastraSpeechParams
}
```

### `MastraModelRegistry`

Manages model creators and pattern matching.

```typescript
class MastraModelRegistry {
  registerModels(pattern: string | RegExp | string[], creator: AgentCreator): void
  getAgentCreator(modelName: string): AgentCreator
  setDefaultCreator(creator: AgentCreator): void
}
```

### `MastraToolRegistry`

Type-safe tool registration and management.

```typescript
class MastraToolRegistry<TD, RM> {
  register<K, R>(name: K, fn: (args: TD[K]["args"]) => R): MastraToolRegistry<TD, RM & {[P in K]: R}>
  get<K>(name: K): (args: TD[K]["args"]) => RM[K]
  has<K>(name: K): boolean
}
```

## 🤝 Compatibility

- **AgentMark Core**: `^3.2.0`
- **Mastra Core**: `^0.1.0`
- **Node.js**: `18+`
- **TypeScript**: `5.0+`

## 🚦 Examples

Check out the [demo app](../../apps/mastra-demo-app) for comprehensive examples showcasing:

- Object outputs with structured schemas
- Text generation with custom parameters
- Image generation with detailed prompts
- Speech synthesis with voice selection
- Runtime configuration and telemetry
- Tool integration and function calling

## 🐛 Troubleshooting

**"No agent creator found for model: xxx"**
- Ensure the model is registered in your `MastraModelRegistry`
- Check model name spelling in your prompt files

**"Tool xxx not registered"**
- Register the tool in your `MastraToolRegistry`
- Verify tool names match between prompt and registry

**Type errors**
- Ensure your prompt type definitions match your actual prompt files
- Check that input/output schemas are properly defined

## 📄 License

MIT License - see [LICENSE](../../LICENSE.md) for details.

## 🤝 Contributing

Contributions are welcome! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

## 🔗 Related Projects

- [AgentMark Core](../agentmark-core) - Core AgentMark functionality
- [Vercel AI v4 Adapter](../vercel-ai-v4-adapter) - Vercel AI SDK adapter
- [Mastra](https://mastra.ai) - TypeScript agent framework