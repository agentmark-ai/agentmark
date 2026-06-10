# Observing a prompt run (traces)

For the **canonical tracing setup** — full provider config, init order,
AGENTMARK_API_KEY / AGENTMARK_APP_ID semantics — fetch
`https://docs.agentmark.co/observe/tracing-setup.md`. Tracing is **SDK-agnostic**:
the same `AgentMarkSDK` + `initTracing()` / `observe()` wiring works with whatever
SDK you call, because AgentMark renders prompts to a neutral shape and you call the
model yourself. This workflow exists to flag the **two non-obvious failure modes**
that catch agents out, because they're hard to see in the docs:

1. To see the **model-call ("generation") span** — the one carrying model,
   token usage, and input/output — your runtime must register the AgentMark
   span processor **as the global OTel provider** (`registerGlobally: true`).
   The generation span comes from the AI SDK's telemetry, which emits through
   the **global** tracer. Without `registerGlobally: true`, the model-call
   span goes to a no-op tracer and nothing is forwarded — even though custom
   `span()`/`observe()` wrappers still work, so the failure looks like
   "tracing is fine, just no model spans."
2. Wrapping your call in `span()` / `observe()` / `trace()` records a *custom*
   span — it does **not** produce the model-call span. For the generation
   span you also need telemetry on `prompt.format({ telemetry })`, wired via
   `createPromptTelemetry(...)`. Use both if you want custom spans plus the
   generation span.

## Recipe

The model call below uses the **Vercel AI SDK** (`generateText` from `ai`) as a
concrete example, because its built-in telemetry is what emits the generation
span. Swap step 3 for whatever SDK you call — the tracing wiring (steps 1, 2, 4)
is identical regardless of SDK. The client is the neutral one (`createAgentMarkClient`
from `@agentmark-ai/fallback-adapter`); it only loads + renders prompts, and you
call the model.

```ts
import { AgentMarkSDK } from "@agentmark-ai/sdk";
import { createPromptTelemetry } from "@agentmark-ai/prompt-core";
import { generateText } from "ai";
// plus your usual client setup:
//   createAgentMarkClient({ loader }) from "@agentmark-ai/fallback-adapter"

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
//    produces the generation span. (Mirrors what createWebhookRunner does when
//    AgentMark Cloud runs your prompts.)
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

## Where trace-level input/output come from

The trace list/detail's single input/output per trace is **derived at read
time**, identically in cloud and the local dev server: the root (prompt-run)
span's `agentmark.input`/`agentmark.output` attributes win when present — the
WebhookRunner writes them automatically on every run — with a fallback to the
first GENERATION span's input and last GENERATION span's output (timestamp
order) for traces emitted without the runner. Two consequences:

- **Never "fix" missing trace I/O in an executor.** Executors don't set it.
  If `doctor --smoke` reports the trace missing input/output, the gap is in
  instrumentation (the model SDK isn't emitting GENERATION spans with I/O) or
  an outdated runner — not in customer code.
- GENERATION spans come from the host model SDK's instrumentation (AI SDK
  `experimental_telemetry`, Pydantic AI `InstrumentationSettings(version=3)`,
  …), which is exactly what the telemetry-on-`format()` step above enables.

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
