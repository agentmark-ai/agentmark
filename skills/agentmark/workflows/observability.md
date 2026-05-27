# Observing a prompt run (traces)

To see a run in AgentMark — with the **model-call ("generation") span** that
carries the model, token usage, and input/output — your runtime must (1)
register the AgentMark span processor **as the global OTel provider**
(`registerGlobally: true`) and (2) run the prompt with **telemetry enabled**.

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

// 1. Register the AgentMark span processor AS THE GLOBAL OTel provider.
//    registerGlobally: true is REQUIRED for the generation span: the AI SDK
//    emits it through the *global* tracer, so AgentMark's provider must be the
//    global one. Without it the model-call span goes to a no-op tracer and
//    nothing is forwarded (a custom span()/observe() still works — but you get
//    no generation span). initTracing() returns the provider; keep it to flush.
//    disableBatch: true exports each span synchronously — in a short-lived
//    script (run a few prompts, then exit) the default batch processor often
//    terminates before its spans flush, so they're silently lost. A
//    long-running server can omit disableBatch and rely on the batch timer.
const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY,   // or the ~/.agentmark/auth.json session bearer
  appId: process.env.AGENTMARK_APP_ID,
  baseUrl: process.env.AGENTMARK_API_URL,  // set for STG / self-host
});
const tracing = sdk.initTracing({ registerGlobally: true, disableBatch: true });

// 2. Load the DEPLOYED prompt as usual, then format WITH telemetry. This line
//    is the one that matters: it injects the AI SDK experimental_telemetry that
//    produces the generation span. (Mirrors the adapter's own runner.ts.)
const prompt = await client.loadTextPrompt("triage");
const { telemetry } = createPromptTelemetry("triage", { isEnabled: true });
const input = await prompt.format({ props: { subject: "...", body: "..." }, telemetry });

// 3. Run it. A trace with an `llm` generation span (model, tokens, input/output)
//    lands in AgentMark within a few seconds.
const result = await generateText(input);

// 4. In a short-lived process (a CI runner, a one-off script), flush before the
//    process exits — otherwise the batched spans never leave it. Long-running
//    servers can skip this; the batch processor flushes on its own.
await tracing.forceFlush();
await tracing.shutdown();
```

`span()` / `observe()` / `trace()` are for wrapping *your own* code in custom
spans (e.g. a retrieval step) around the model call. They are **not** a
substitute for the telemetry-on-`format()` step above — use both if you want
custom spans plus the generation span.

> **Benign warning:** with a `<System>` block in your prompt, the AI SDK may log
> *"System messages in the prompt or messages fields can be a security risk… Use
> the system option instead."* This is expected for AgentMark prompts (the
> System block is intentional) — the run and its generation span are unaffected.

## Version compatibility

The adapter targets Vercel AI SDK v5 (`ai@^5`), which expects a **v2 provider**.
Use `@ai-sdk/openai@^2` — the v3 provider throws `UnsupportedModelVersionError`
(model-spec v3 vs v2) against `ai@5`:

```jsonc
// package.json
"ai": "^5.0.52",
"@ai-sdk/openai": "^2"
```
