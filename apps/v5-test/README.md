# AI SDK v5 Test App

This app demonstrates and tests the AI SDK v5 adapter for AgentMark.

## Setup

1. Make sure you have an OpenAI API key set in your `.env` file:
   ```
   OPENAI_API_KEY=your-api-key-here
   ```

2. Install dependencies (from root):
   ```bash
   yarn install
   ```

## Running Examples

### Basic Example (Text + Object)
```bash
npm run test
```

### Text Prompt Example
```bash
npm run test:text
```

### Object Prompt Example
```bash
npm run test:object
```

### Tools Example
```bash
npm run test:tools
```

## Features Tested

- ✅ Text prompt generation (streaming and non-streaming)
- ✅ Object prompt generation with schema validation
- ✅ Tool calling with custom tool registry
- ✅ Tool options with experimental_context merging
- ✅ Model registry with pattern matching

