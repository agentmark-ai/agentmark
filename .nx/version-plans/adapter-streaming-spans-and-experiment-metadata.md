---
"@agentmark-ai/ai-sdk-v4-adapter": minor
"@agentmark-ai/ai-sdk-v5-adapter": minor
"@agentmark-ai/claude-agent-sdk-v0-adapter": minor
"@agentmark-ai/mastra-v0-adapter": minor
---

Streaming-span observability + experiment-run metadata in the dataset runners.

- **Streaming spans now record input and output.** The streaming paths (object / text / tool-call) were refactored onto the new `streamWithSpan()` helper from `@agentmark-ai/sdk`: the span input is set to just the assembled `messages` (not the full SDK call payload) and the final model output (accumulated text / last partial object) is captured via `ctx.setOutput()`. Previously streaming spans recorded neither. _(ai-sdk-v4, ai-sdk-v5, mastra)_
- **Provider stream errors now fail the span.** In-stream `error` chunks from `streamText` / `streamObject` are re-thrown so the wrapping span is marked ERROR, instead of being caught and emitted as a JSON error line while the span stayed green. _(ai-sdk-v4, ai-sdk-v5, mastra)_
- **`runDataset` accepts `experimentKey` and `sourceTreeHash`** (optional trailing parameters), forwarded into per-item span metadata for experiment grouping and source-tree correlation (regression-gate baseline join). _(all four adapters)_
- **Dataset-row parse errors are surfaced** rather than silently dropped — a row with `type === "error"` now emits an `experimentErrorChunk` instead of being skipped, so a fully-invalid dataset produces visible failures rather than a silent zero-output pass. _(ai-sdk-v5)_
