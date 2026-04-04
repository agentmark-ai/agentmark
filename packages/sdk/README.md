# AgentMark SDK

The SDK for tracing LLM calls and integrating with AgentMark Cloud. Built on OpenTelemetry.

## Installation

```bash
npm install @agentmark-ai/sdk
```

## Quick Start

```typescript
import { AgentMarkSDK, span } from "@agentmark-ai/sdk";

// Initialize the SDK with your API key
const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
});

// Start the OpenTelemetry tracer
sdk.initTracing();

// Wrap any LLM call in a span
const { result, traceId } = await span(
  { name: "customer-support", userId: "user-123" },
  async (ctx) => {
    // Your LLM call here — works with any SDK
    const response = await generateText({ /* ... */ });

    // Create child spans for sub-operations
    await ctx.span({ name: "save-to-db" }, async () => {
      await db.saveResponse(response);
    });

    return response;
  }
);

console.log(`Trace: ${traceId}`);
```

## API

### `AgentMarkSDK`

Main SDK class for initialization and cloud integration.

```typescript
const sdk = new AgentMarkSDK({
  apiKey: string;    // Your AgentMark API key
  appId: string;     // Your AgentMark app ID
  baseUrl?: string;  // Custom API URL (default: https://api.agentmark.co)
});
```

**Methods:**

- **`sdk.initTracing(options?)`** — Start the OpenTelemetry tracer. Options: `{ disableBatch?: boolean }`.
- **`sdk.getApiLoader()`** — Get an `ApiLoader` instance for loading prompts from AgentMark Cloud.
- **`sdk.score(props)`** — Submit an evaluation score for a trace.

### `span(options, fn)`

Create a root span. Returns `{ result, traceId }`.

```typescript
const { result, traceId } = await span(
  {
    name: "my-span",           // Required
    userId: "user-123",       // Optional: associate with a user
    sessionId: "session-456", // Optional: group related traces
    sessionName: "chat",      // Optional: human-readable session name
    metadata: { env: "prod" }, // Optional: key-value metadata
  },
  async (ctx) => {
    // ctx.traceId — the trace ID
    // ctx.spanId — the root span ID
    // ctx.setAttribute(key, value) — set span attributes
    // ctx.addEvent(name, attributes?) — add span events
    // ctx.span(options, fn) — create child spans
    return await doWork();
  }
);
```

### `ctx.span(options, fn)`

Create a child span within a trace. Available on the `SpanContext` passed to `span()` and nested `span()` callbacks.

```typescript
await span({ name: "request" }, async (ctx) => {
  const user = await ctx.span({ name: "fetch-user" }, async (spanCtx) => {
    return await db.getUser(id);
  });

  await ctx.span({ name: "generate-response" }, async (spanCtx) => {
    return await llm.generate({ user });
  });
});
```

### `ApiLoader`

Re-exported from `@agentmark-ai/loader-api` for convenience. Load prompts from AgentMark Cloud or a local dev server.

```typescript
// Cloud loader (via SDK)
const loader = sdk.getApiLoader();

// Or create directly
import { ApiLoader } from "@agentmark-ai/sdk";

const cloudLoader = ApiLoader.cloud({
  apiKey: "...",
  appId: "...",
});

const localLoader = ApiLoader.local({
  port: 9418,
});
```

## Documentation

Full documentation at [docs.agentmark.co](https://docs.agentmark.co/agentmark/).

## License

[MIT](../../LICENSE.md)
