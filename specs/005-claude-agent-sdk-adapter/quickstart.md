# Quickstart: Claude Agent SDK Adapter

This guide shows how to use the Claude Agent SDK adapter with AgentMark prompts.

## Installation

```bash
npm install @agentmark-ai/claude-agent-sdk-adapter @agentmark-ai/sdk @anthropic-ai/claude-agent-sdk
```

## Basic Usage

### 1. Create a Prompt File

Create `prompts/analyze-code.prompt.mdx`:

```mdx
---
name: analyze-code
metadata:
  model:
    name: claude-sonnet-4-20250514
  maxTurns: 10
  permissionMode: default
---

<User>
  Analyze the code in {{directory}} and provide a summary of its structure.
</User>
```

### 2. Setup the Client

```typescript
import { createAgentMarkClient, ClaudeAgentModelRegistry, ClaudeAgentToolRegistry } from '@agentmark-ai/claude-agent-sdk-adapter';
import { FileLoader } from '@agentmark-ai/loader-file';
import { query } from '@anthropic-ai/claude-agent-sdk';

// Create the AgentMark client
const client = createAgentMarkClient({
  loader: new FileLoader({ dataDir: './prompts' }),
  modelRegistry: ClaudeAgentModelRegistry.createDefault(),
  toolRegistry: new ClaudeAgentToolRegistry(),
});

// Load and format the prompt
const prompt = await client.loadPrompt('analyze-code');
const formatted = await client.format(prompt, { directory: './src' });

// Adapt to Claude Agent SDK format
const { prompt: promptText, options } = await client.adaptText(formatted);

// Execute with Claude Agent SDK
for await (const message of query(promptText, options)) {
  console.log(message);
}
```

## Custom Tools

Register custom tools to extend agent capabilities:

```typescript
import { ClaudeAgentToolRegistry } from '@agentmark-ai/claude-agent-sdk-adapter';

const toolRegistry = new ClaudeAgentToolRegistry()
  .register(
    'search_docs',
    'Search documentation for a given query',
    {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results', default: 10 }
      },
      required: ['query']
    },
    async ({ query, limit = 10 }) => {
      // Your search implementation
      return { results: await searchDocs(query, limit) };
    }
  );

const client = createAgentMarkClient({
  loader: new FileLoader({ dataDir: './prompts' }),
  modelRegistry: ClaudeAgentModelRegistry.createDefault(),
  toolRegistry,
});
```

## Model Configuration

Configure model-specific settings with pattern matching:

```typescript
import { ClaudeAgentModelRegistry } from '@agentmark-ai/claude-agent-sdk-adapter';

const modelRegistry = ClaudeAgentModelRegistry.createDefault()
  // Configure all thinking models
  .registerModels(/claude-.*-thinking/, (name) => ({
    model: name,
    maxThinkingTokens: 10000
  }))
  // Configure specific model
  .registerModels('claude-opus-4-20250514', () => ({
    model: 'claude-opus-4-20250514',
    maxThinkingTokens: 20000
  }));
```

## Structured Output

Get typed JSON responses:

```typescript
import { z } from 'zod';

const AnalysisSchema = z.object({
  summary: z.string(),
  fileCount: z.number(),
  languages: z.array(z.string()),
});

// In your prompt MDX:
// ---
// outputSchema: AnalysisSchema
// ---

const formatted = await client.format(prompt, { directory: './src' });
const { prompt: promptText, options } = await client.adaptObject<z.infer<typeof AnalysisSchema>>(formatted);

for await (const message of query(promptText, options)) {
  if (message.type === 'result' && message.structured_output) {
    const analysis = message.structured_output as z.infer<typeof AnalysisSchema>;
    console.log('Languages:', analysis.languages);
  }
}
```

## Telemetry

Capture execution events for monitoring:

```typescript
import { createTelemetryHooks, mergeHooks } from '@agentmark-ai/claude-agent-sdk-adapter';

const telemetryHooks = createTelemetryHooks(
  {
    isEnabled: true,
    promptName: 'analyze-code',
    props: { directory: './src' },
    functionId: 'run-123',
  },
  async (event) => {
    // Send to your telemetry service
    await telemetryService.track(event);
  }
);

const client = createAgentMarkClient({
  // ... other options
  adapterOptions: {
    hooks: [telemetryHooks],
  },
});
```

## Permission Modes

Control tool execution permissions:

```typescript
const client = createAgentMarkClient({
  // ... other options
  adapterOptions: {
    // 'default' - Prompt for permissions (safest)
    // 'acceptEdits' - Auto-accept file edits
    // 'bypassPermissions' - Skip all checks (use with caution)
    // 'plan' - Planning mode, limited tools
    permissionMode: 'default',
  },
});
```

## CLI Integration

Use with AgentMark CLI via the webhook handler:

```typescript
// runner.ts (separate entry point)
import { ClaudeAgentWebhookHandler } from '@agentmark-ai/claude-agent-sdk-adapter/runner';

const handler = new ClaudeAgentWebhookHandler({
  modelRegistry: ClaudeAgentModelRegistry.createDefault(),
  toolRegistry: new ClaudeAgentToolRegistry(),
});

// Returns config for CLI to execute
const config = await handler.runPrompt(promptAst, options);
```

## Next Steps

- See [data-model.md](./data-model.md) for complete type reference
- See [research.md](./research.md) for design decisions
- See [spec.md](./spec.md) for full requirements
