# AgentMark Adapter Requirements

## Overview

An AgentMark adapter integration bridges AgentMark's standardized prompt format
and a specific AI framework (Vercel AI SDK, Mastra, Claude Agent SDK,
pydantic-ai, …). A complete integration has **two halves**:

1. **Adapter** — formats AgentMark prompt config into your SDK's native
   parameters. Pure transformation, no I/O. Implements the `Adapter<T>`
   interface from `@agentmark-ai/prompt-core`.
2. **Executor** — runs those parameters against your SDK and emits the
   normalized `AgentEvent` stream that AgentMark's webhook runner, CLI dev
   server, and cloud consumers all speak. Implements the `Executor` interface,
   almost always via the `createExecutor` builder.

The two halves never reference each other's types — they're decoupled by the
`AgentEvent` protocol. That protocol is a **stable wire contract**: changes to
it are semver-major (see `packages/conformance-vectors/`).

> **Start here — scaffold it:**
>
> ```bash
> node scripts/create-adapter.mjs <framework> --major 0 --peer <sdk-package>
> ```
>
> generates `packages/<framework>-v0-adapter/` with the entire required
> surface below, and its conformance suite (text/object/error in both stream
> modes + abort) is **green before you write a line** — the only file that
> touches your SDK is `src/sdk.ts`, mocked in the generated test. Implement
> that one seam, extend the param maps, pin your peer dep, done.
>
> For reading reference: the smallest complete hand-written adapter is
> `packages/mastra-v0-adapter` (TS) or
> `packages/pydantic-ai-v0-adapter` (Python). For Vercel-AI-SDK-style
> param-bag SDKs, `packages/ai-sdk-v4-adapter` / `ai-sdk-v5-adapter` are thin
> shells over shared cores — read them to see how little version-specific code
> is actually required.

## Half 1 — The Adapter

Every adapter implements `Adapter<T>` from `@agentmark-ai/prompt-core`:

- A unique `__name` identifier (convention: `"<framework>-v<major>"`, e.g.
  `"vercel-ai-v5"`, `"pydantic-ai-v0"`).
- Four adapt methods: `adaptText`, `adaptObject`, `adaptImage`, `adaptSpeech`.
  Each transforms an AgentMark config object (`TextConfig`, `ObjectConfig`, …)
  into your SDK's native params. If your SDK doesn't support a modality,
  return a clear unsupported error — and declare it in your executor's
  `capabilities()`.
- The interface types adapt returns as `unknown` on purpose; your concrete
  class should declare its real param types (see the `declare` overrides in
  `ai-sdk-v5-adapter/src/adapter.ts` for the zero-runtime-cost idiom).
- `AdaptOptions` is a **closed** type (`telemetry`, `apiKey`, `baseURL`,
  `toolContext`). If your framework needs extra options, accept
  `AdaptOptions & YourOptions` — don't widen the core type.

### What the core gives you for free

Don't hand-roll these — they exist so fixes land in every adapter at once:

| Helper | From | Use for |
|---|---|---|
| `applyParamMap` | `prompt-core` | Declarative snake_case → SDK-native param renames (one table per modality) |
| `buildTelemetryMetadata` | `prompt-core` | Standard telemetry metadata block (prompt name, props, agentmark_meta) |
| `BaseAdapter` | `prompt-core` | Tool registry + `mcp://server/tool` (and `mcp://server/*` wildcard) resolution. Extend it when your SDK takes a tools record keyed by bare name |
| `VercelAIAdapterCore` | `ai-sdk-shared` | The complete adapter body for Vercel-AI-SDK-shaped frameworks — subclass and inject a small `VercelAdapterSpec` (max_calls mapping, message conversion, MCP factory, `jsonSchema`) |

`BaseAdapter` doesn't fit every SDK — Mastra keys MCP tools by full URI and
the Claude Agent SDK takes a prompt string, so both implement `Adapter`
directly. That's fine. Reuse `applyParamMap` + `buildTelemetryMetadata` as
free functions regardless.

### Required transformations per modality

- **Text**: messages → framework format; model settings (`temperature`,
  `max_tokens`, `top_p`, …); tools if supported; telemetry.
- **Object**: messages + JSON schema → framework's structured-output format.
- **Image**: prompt, `num_images`, `size`, `aspect_ratio`, seed.
- **Speech**: text, voice, output format, speed.

## Half 2 — The Executor

The executor turns your SDK's responses into `AgentEvent`s:

```
text-delta | reasoning-delta | tool-call | tool-result   (text kind)
object-delta | object-final                              (object kind)
finish (carries usage — exactly once, terminal)
error  (terminal only — never throw from the stream)
```

**Use `createExecutor` from `@agentmark-ai/prompt-core`.** You supply small
handlers — `text` / `streamText` / `object` / `streamObject` (+ optional
`image` / `speech`) — that call your SDK and yield events or return results.
The builder enforces the hard invariants *by construction*:

- exactly one terminal `finish` carrying usage (zeros if your SDK omits it),
- `error` only as a terminal event (exceptions become error events),
- `object-final` synthesized from the last delta when the SDK doesn't emit one,
- `ctx.shouldStream` routing between your one-shot and streaming handlers.

Honor `ctx.signal` (`AbortSignal`) by forwarding it to your SDK's request —
that's how mid-stream cancellation works end-to-end.

Implement `capabilities()` honestly: `{ text, object, image, speech }`
booleans gate which prompt kinds the platform will route to you.

### Conformance — the contract gate

`@agentmark-ai/prompt-core` exports the same conformance suite the first-party
adapters run. **A new adapter is not done until this passes:**

```ts
import { runExecutorConformance } from "@agentmark-ai/prompt-core";

await runExecutorConformance(myExecutor, {
  text: textFixture,            // whatever your adapter produces for a text prompt
  object: objectFixture,
  errorInput: { __explode: true },  // a payload your handler rejects
  textWithTools: toolsFixture,      // if your SDK supports tools
});
```

This runs the full suite under **both** `shouldStream: true` and `false`, so a
broken one-shot path can't hide behind the streaming default. Also exercise
abort: `assertAbortStream` drives the abort (collects events, fires the
controller after N, and verifies iteration terminates cleanly) — the boundary
assertions are yours to pin on its returned events. See
`ai-sdk-shared/test/executor-conformance.test.ts` for the full pattern: script
an endless stream, assert the SDK received `ctx.signal` as `abortSignal`, and
assert nothing was emitted past the abort boundary. Check usage payloads with
`assertUsageShape`.

Python mirrors the stream/error suite: `run_executor_conformance`,
`assert_text_stream`, `assert_object_stream`, `assert_error_stream` from
`agentmark.prompt_core` (see
`pydantic-ai-v0-adapter/tests/test_executor_conformance.py`). Note: Python has
no abort assertion yet — abort coverage is TS-only today.

### Serving the webhook path

To work with AgentMark Cloud / `agentmark dev` (the dashboard "Run prompt"
button, platform-driven experiments), pair your executor with the webhook
runner — one call via `@agentmark-ai/sdk`:

```ts
import { createWebhookRunner } from "@agentmark-ai/sdk";

const runner = createWebhookRunner({ executor: myExecutor, loader });
// runner.runPrompt / runner.runExperiment — the shape the CLI + gateway expect
```

This wires the neutral `DefaultAdapter` (your executor receives the rendered
prompt config as `formatted`) plus AgentMark's OTEL span hooks (tracing).

## Model Registry

Provide a model registry so users map model names to SDK model instances:

- exact-name matches, regex pattern matches, arrays for bulk registration,
  and a default-creator fallback;
- `provider/model` resolution via `registerProviders` (what `pull-models`
  writes into `agentmark.json`);
- creators receive `(modelName, options)` — honor `apiKey` / `baseURL` from
  `AdaptOptions`;
- informative errors for unregistered models.

For Vercel-AI-SDK-shaped frameworks, subclass the shared registry:
`class MyRegistry extends VercelAIModelRegistry<MyModelUnion> {}` — the
implementation lives in `ai-sdk-shared`.

## Tool Registry

If your framework supports function calling:

- transform AgentMark tool schemas to framework format, preserving type
  safety between tool args and implementations;
- support `tool_choice` configurations where the SDK allows;
- resolve `mcp://server/tool` references and `mcp://server/*` wildcards
  (free if you extend `BaseAdapter` — supply an `McpClientFactory` for your
  SDK's MCP entrypoint);
- pass `toolContext` through to tool execution.

## Client Creation Function

Provide a factory (`createAgentMarkClient` convention) that accepts an
optional loader, a required model registry, and optional tools/MCP servers,
instantiates your adapter, and returns a typed AgentMark client. Support
generic `PromptShape` typing so users get compile-time prompt input/output
types.

## Package Structure

```
packages/<framework>-v<major>-adapter/
├── package.json          # @agentmark-ai/<framework>-v<major>-adapter
├── tsconfig.json
├── tsup.config.ts        # dual CJS/ESM + dts
├── vitest.config.ts
├── src/
│   ├── index.ts          # public exports + createAgentMarkClient factory
│   ├── adapter.ts        # Adapter implementation (Half 1)
│   ├── executor.ts       # createExecutor handlers (Half 2)
│   └── model-registry.ts # if not reusing ai-sdk-shared's
└── test/
    ├── adapter.test.ts
    ├── executor-conformance.test.ts
    └── fixtures/         # .prompt.mdx fixtures per modality
```

- Name versioned: `-v<major>` pinned to your peer SDK's major. Specify the
  SDK as a **peer dependency** with the supported range.
- No registration anywhere else: no central adapter registry, no CLI/SDK
  wiring, no CI edits. The package is self-contained; consumers instantiate
  it directly.

## Testing Requirements

1. **Executor conformance** (non-negotiable): `runExecutorConformance` with
   text/object/error fixtures, plus an `assertAbortStream` case. Stub your
   SDK with scripted responses — the executor's job is pure event
   translation, so no real model calls are needed. References:
   `mastra-v0-adapter/test/executor.test.ts` for
   scripted-SDK stream simulation and exact-sequence assertions;
   `ai-sdk-shared/test/executor-conformance.test.ts` for the abort case.
2. **Adapter unit tests per modality**: exact-shape assertions (`toEqual`)
   on the adapted params — including param renames, telemetry block, tool
   resolution, and schema conversion.
3. **Model registry tests**: exact match, regex, arrays, provider/model
   format, default fallback, missing-model errors.
4. **Tool tests** (if applicable): registration, execution with context,
   `mcp://` resolution, missing-tool errors.
5. **Error paths**: invalid model names, malformed configs, SDK exceptions
   (must become terminal `error` events, never throws).

Assertion quality bar: positional `toEqual` on full event sequences beats
`toBeDefined`. If `return {}` from your production code would pass the test,
the test is too weak.

## Implementation Checklist

- [ ] `Adapter<T>` implemented (`__name`, four adapt methods, typed returns)
- [ ] Shared helpers reused (`applyParamMap`, `buildTelemetryMetadata`,
      `BaseAdapter`/`VercelAIAdapterCore` where they fit)
- [ ] `Executor` built with `createExecutor`; honest `capabilities()`
- [ ] `ctx.signal` forwarded to the SDK; `ctx.shouldStream` respected
- [ ] `runExecutorConformance` passes (both stream modes)
- [ ] `assertAbortStream` + `assertUsageShape` exercised
- [ ] Model registry with pattern + provider/model support
- [ ] Tool registry + MCP resolution (if framework supports tools)
- [ ] `createAgentMarkClient` factory with `PromptShape` typing
- [ ] Webhook path verified via `createWebhookRunner`
- [ ] Package: peer deps pinned, dual CJS/ESM exports, `-v<major>` name
- [ ] Tests meet the assertion-quality bar above
