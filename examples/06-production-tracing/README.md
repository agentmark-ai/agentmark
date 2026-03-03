# 06 — Production Tracing

Trace LLM calls in production with the AgentMark SDK and OpenTelemetry.

## The code

`index.ts` shows how to initialize the SDK, wrap LLM calls in traces, and use child spans for sub-operations. Every traced call is recorded with model, tokens, cost, and latency.

## Setup

```bash
npm install @agentmark-ai/sdk @agentmark-ai/ai-sdk-v5-adapter
```

Set environment variables:

```bash
AGENTMARK_API_KEY=your-api-key
AGENTMARK_APP_ID=your-app-id
```

## Run it

```bash
npx tsx index.ts
```

## What to notice

- `sdk.initTracing()` starts the OpenTelemetry exporter — all traces are sent to AgentMark Cloud
- `trace()` creates a root span. The callback receives a `TraceContext` with `traceId`, `spanId`, and `span()` for nesting
- Child spans (via `ctx.span()`) let you trace sub-operations like database calls or post-processing
- The `traceId` is returned immediately — use it to link traces to your application logs
- Traces are viewable locally (via `agentmark dev`) or in AgentMark Cloud
