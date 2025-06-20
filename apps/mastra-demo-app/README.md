# Mastra AgentMark Demo App

This demo application showcases the integration between AgentMark and Mastra, demonstrating how to use AgentMark prompts with the Mastra adapter for various AI modalities.

## 🚀 Features Demonstrated

- **📊 Object Output**: Structured responses with type-safe schemas
- **✍️ Text Generation**: Creative writing with customizable parameters  
- **🎨 Image Generation**: AI-powered image creation with detailed prompts
- **🎙️ Speech Synthesis**: Text-to-speech with voice selection
- **⚙️ Runtime Configuration**: Dynamic settings and telemetry
- **🔧 Model Registry**: Flexible model pattern matching

## 📁 Project Structure

```
src/
├── prompts/                    # AgentMark prompt files
│   ├── math-solver.prompt.mdx     # Object output demo
│   ├── creative-writer.prompt.mdx # Text generation demo
│   ├── image-generator.prompt.mdx # Image generation demo
│   └── speech-narrator.prompt.mdx # Speech synthesis demo
└── index.ts                    # Main demo application
```

## 🛠️ Setup

1. **Install dependencies**:
   ```bash
   cd apps/mastra-demo-app
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env and add your OpenAI API key
   ```

3. **Run the demo**:
   ```bash
   npm run dev
   ```

## 🔧 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | Your OpenAI API key for GPT and DALL-E | ✅ Yes |
| `MASTRA_API_URL` | Custom Mastra API URL | ❌ Optional |
| `MASTRA_API_KEY` | Mastra API key if required | ❌ Optional |

## 📋 Requirements

- Node.js 18+ 
- OpenAI API key with access to:
  - GPT-4 or GPT-3.5 models
  - DALL-E 3 (for image generation)
  - TTS-1 (for speech synthesis)

## 🎯 Demo Scenarios

### 1. Math Problem Solving (Object Output)
```typescript
// Uses structured output to solve math problems step-by-step
const result = await mathPrompt.format({
  props: { problem: "If a train travels 120 miles in 3 hours..." }
});
// Returns: { step_by_step_solution: string[], final_answer: string, confidence: number }
```

### 2. Creative Writing (Text Output)
```typescript
// Generates creative content with style and tone parameters
const result = await writerPrompt.format({
  props: { 
    topic: "artificial intelligence", 
    style: "poem", 
    tone: "inspiring" 
  }
});
```

### 3. Image Generation
```typescript
// Creates images with detailed prompts and style specifications
const result = await imagePrompt.format({
  props: {
    subject: "a robot teaching a classroom",
    style: "artistic",
    setting: "futuristic school"
  }
});
```

### 4. Speech Synthesis
```typescript
// Converts text to speech with voice selection
const result = await speechPrompt.format({
  props: {
    text_to_speak: "Welcome to the future of AI development!",
    voice: "nova"
  }
});
```

## 🔍 What Gets Demonstrated

1. **AgentMark Integration**: Loading and formatting `.prompt.mdx` files
2. **Mastra Adapter**: Converting AgentMark configs to Mastra-compatible parameters
3. **Type Safety**: Full TypeScript support with proper type inference
4. **Model Registry**: Flexible model registration and pattern matching
5. **Runtime Configuration**: Dynamic API keys, telemetry, and custom options
6. **Error Handling**: Proper error management and user feedback

## 🏗️ Architecture

```
AgentMark Prompts (.prompt.mdx)
         ↓
   Mastra Adapter
         ↓
   Mastra Agent API
         ↓
    AI Model APIs
```

The demo shows how the Mastra adapter seamlessly bridges AgentMark's prompt format with Mastra's agent architecture, preserving all configuration options and enabling type-safe interactions.

## 🐛 Troubleshooting

**"OPENAI_API_KEY environment variable is required"**
- Ensure you've copied `.env.example` to `.env` and added your OpenAI API key

**"No agent creator found for model: xxx"**
- Check that the model is registered in the model registry
- Verify the model name matches what's in your prompt file

**Import/dependency errors**
- Run `npm install` to ensure all dependencies are installed
- Check that you're in the correct directory (`apps/mastra-demo-app`)

## 📚 Related Documentation

- [AgentMark Core Documentation](../../packages/agentmark-core/README.md)
- [Mastra Adapter Documentation](../../packages/mastra-adapter/README.md)
- [Mastra Official Documentation](https://mastra.ai/docs)

## 🤝 Contributing

This demo is part of the AgentMark project. See the main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on contributing to the project.