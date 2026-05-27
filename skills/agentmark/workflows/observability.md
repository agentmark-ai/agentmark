# Observing a prompt run (traces)

To see a run in AgentMark — with the **model-call ("generation") span** that
carries the model, token usage, and input/output — your runtime must (1)
register the AgentMark span processor and (2) run the prompt with **telemetry
enabled**.

This is the step most often missed: wrapping your call in `span()` / `observe()`
/ `trace()` records a *custom* span, but it does **not** produce the model-call
span. The generation span comes from the AI SDK's telemetry, which
`prompt.format({ telemetry })` wires up for you.

## Recipe (Vercel AI SDK adapter)

```ts
import { AgentMarkSDK } from "@agentmark-ai/sdk";
import { createPromptTelemetry } from "@agentmark-ai/prompt-core";
import { generateText } from "ai";
// plus your usual client setup:
//   createAgentMarkClient({ loader, modelRegistry }) from "@agentmark-ai/ai-sdk-v5-adapter"

// 1. Register the AgentMark span processor. This installs the exporter that
//    forwards spans to the gateway — without initTracing() nothing is sent.
const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY,   // or the ~/.agentmark/auth.json session bearer
  appId: process.env.AGENTMARK_APP_ID,
  baseUrl: process.env.AGENTMARK_API_URL,  // set for STG / self-host
});
sdk.initTracing();

// 2. Load the DEPLOYED prompt as usual, then format WITH telemetry. This line
//    is the one that matters: it injects the AI SDK experimental_telemetry that
//    produces the generation span. (Mirrors the adapter's own runner.ts.)
const prompt = await client.loadTextPrompt("triage");
const { telemetry } = createPromptTelemetry("triage", { isEnabled: true });
const input = await prompt.format({ props: { subject: "...", body: "..." }, telemetry });

// 3. Run it. A trace with an `llm` generation span (model, tokens, input/output)
//    lands in AgentMark within a few seconds.
const result = await generateText(input);
```

`span()` / `observe()` / `trace()` are for wrapping *your own* code in custom
spans (e.g. a retrieval step) around the model call. They are **not** a
substitute for the telemetry-on-`format()` step above — use both if you want
custom spans plus the generation span.

## Version compatibility

The adapter targets Vercel AI SDK v5 (`ai@^5`), which expects a **v2 provider**.
Use `@ai-sdk/openai@^2` — the v3 provider throws `UnsupportedModelVersionError`
(model-spec v3 vs v2) against `ai@5`:

```jsonc
// package.json
"ai": "^5.0.52",
"@ai-sdk/openai": "^2"
```
