# @agentmark-ai/otel

Group [AgentMark](https://agentmark.co) traces by **session**, **user**, **tags**, and custom **metadata** using OpenTelemetry context.

It pairs a small wrapper with a span processor:

- `withAgentMark(grouping, fn)` — stashes grouping in the active OpenTelemetry context.
- `AgentMarkSpanProcessor` — stamps that grouping onto every span started in the scope (using the attribute keys AgentMark reads) and batches them to AgentMark's OTLP endpoint.

It is framework-agnostic: any OpenTelemetry span created in the wrapped scope — Vercel AI SDK calls, HTTP requests, DB queries, custom spans — is grouped. It is especially useful with the **Vercel AI SDK v7**, where `telemetry.metadata` no longer reaches spans, so session/user/metadata grouping can't ride it.

## Install

```bash
npm install @agentmark-ai/otel @opentelemetry/sdk-trace-node
```

## Usage

```ts
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AgentMarkSpanProcessor, withAgentMark } from '@agentmark-ai/otel';

// Once, at startup:
const provider = new NodeTracerProvider({
  spanProcessors: [
    new AgentMarkSpanProcessor({
      apiKey: process.env.AGENTMARK_API_KEY!, // raw key, no "Bearer" prefix
      appId: process.env.AGENTMARK_APP_ID!,
    }),
  ],
});
provider.register();

// Per request — wrap your work:
await withAgentMark(
  { sessionId, userId, tags: ['prod'], metadata: { feature: 'chat' } },
  () => generateText({ model, prompt }), // or any traced work
);
```

`withAgentMark` requires an OpenTelemetry context manager to be registered (both `NodeTracerProvider#register()` and `@vercel/otel` do this) so the grouping propagates across `await`.

## License

AGPL-3.0-or-later
