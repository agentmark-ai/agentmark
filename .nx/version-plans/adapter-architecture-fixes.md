---
"@agentmark-ai/prompt-core": minor
"@agentmark-ai/ai-sdk-shared": minor
"@agentmark-ai/ai-sdk-v4-adapter": patch
"@agentmark-ai/ai-sdk-v5-adapter": patch
"@agentmark-ai/claude-agent-sdk-v0-adapter": minor
"agentmark-prompt-core": minor
"agentmark-claude-agent-sdk-v0": patch
---

Adapter-architecture fixes: close the `AdaptOptions` type hole, deduplicate
the v4/v5 adapter bodies, and rewrite the adapter authoring guide around the
Executor + conformance flow.

**prompt-core (minor — BREAKING type narrowing):**

- **`AdaptOptions` is now closed** — the `[key: string]: any` index signature
  is removed; the type is exactly `BaseAdaptOptions` (`telemetry`, `apiKey`,
  `baseURL`, `toolContext`). Nothing in the ecosystem passed or read
  undeclared keys (verified across every package and consumer in the repo),
  and the open bag disabled typo-checking on the most-passed parameter in
  the system while every field access degraded to `any`. Python's
  `AdaptOptions` has always been a closed `TypedDict(total=False)` — the two
  language contracts now agree. **BREAKING for TS consumers that passed
  arbitrary extra keys to `format()` / the adapt methods**: declare your
  options explicitly via intersection (`AdaptOptions & YourOptions`) — the
  pattern the Mastra adapter already uses, and spread-bearing literals
  (e.g. `formatWithDataset`'s `{ props, ...options }`) are unaffected by
  excess-property checking.

**ai-sdk-shared (minor — new public exports):**

- New `VercelAIAdapterCore` + `VercelAdapterSpec`: the version-agnostic
  adapter core for Vercel-AI-SDK-shaped frameworks. The four adapt-method
  bodies (param mapping, telemetry, tool/MCP resolution, the tool-bearing
  object `max_calls` default of 10) live here once; version deltas inject
  via the spec (`maxCallsEntry`, `convertMessages`, `mcpClientFactory`,
  `jsonSchema`) — the same injection pattern `createVercelExecutor` uses
  with `ChunkAdapter`. A param-map or telemetry fix now lands in both `ai`
  majors at once.
- New abort-path conformance coverage for the shared executor factory:
  `ctx.signal` is proven to reach the SDK call as `abortSignal`, with no
  events emitted past the abort boundary (one chunk of read-ahead
  tolerated), under both chunk adapters.
- Added the standard `eslint.config.mjs` (the package was created without
  one, so `eslint .` could not run even in the standalone repo).

**ai-sdk-v4-adapter / ai-sdk-v5-adapter (patch — behavior preserved):**

- Both adapters are now thin version-pinned shells over
  `VercelAIAdapterCore`: each keeps its concrete param types
  (`maxSteps` vs `stopWhen: stepCountIs(n)`; `RichChatMessage[]` passthrough
  vs `ModelMessage[]` conversion) via type-only `declare` narrowing — zero
  runtime wrapper code, public API unchanged. Behavioral parity with the
  previous implementations verified field-by-field (return key/spread
  order, conditional vs unconditional `tools`, `max_calls` default,
  telemetry block, MCP factories, `jsonSchema` wrapping).
- New tests pin the previously-untested MCP **stdio** boot path per major:
  the transport is constructed from the server config verbatim
  (`command`/`args`/`cwd`/`env`) over each major's own entrypoint
  (`ai/mcp-stdio` vs `@ai-sdk/mcp/mcp-stdio`), and v5's `convertMessages`
  unknown-role fall-through (untyped callers' roles forward verbatim).
  Both packages sit at 100% statement/branch/function/line coverage.

**claude-agent-sdk-v0-adapter (minor — abort support):**

- The executor now bridges `ExecCtx.signal` into the SDK's
  `abortController` query option (reusing a caller-provided controller when
  present, so both abort paths converge) — mid-stream cancellation reaches
  the SDK subprocess. `ClaudeAgentQueryOptions` gains the
  `abortController?: AbortController` field.
- `withTracing`'s manual iteration loop now closes the SDK iterator on
  early exit (its `next()` loop bypasses `for await`'s auto-close, so the
  SDK generator's cleanup previously waited for GC on abort/break).
- Abort conformance tests: signal reaches the SDK, no events past the
  abort boundary, caller-controller convergence.

**agentmark-prompt-core / Python (minor — new public export):**

- New `assert_abort_stream` in the executor-conformance suite: drives a
  mid-stream `aclose()` (Python's cancellation channel for async
  generators) and verifies the executor unwinds cleanly without swallowing
  `GeneratorExit`. Exported from `agentmark.prompt_core`. Both Python
  adapters now run it.

**agentmark-claude-agent-sdk-v0 / Python (patch — cancellation bug fix):**

- **Found by the new abort assertion:** closing the executor's stream
  mid-flight did NOT propagate into the SDK query generator — a bare
  `async for` abandons its iterator without closing, so the SDK's cleanup
  (subprocess/connection teardown) only ran at GC. The executor now wraps
  the SDK stream in `contextlib.aclosing`, making cancellation cleanup
  deterministic.

**Tooling (no package bump): `scripts/create-adapter.mjs`** — adapter
scaffold generator. One command produces a complete adapter package
(Adapter + createExecutor-based executor + model registry + client factory
+ conformance tests incl. abort) whose suite is green before any SDK code
is written; the SDK integration is isolated behind a single `src/sdk.ts`
seam. `ADAPTER_REQUIREMENTS.md` now leads with it.
