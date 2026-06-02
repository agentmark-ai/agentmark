---
"@agentmark-ai/ui-components": patch
---

Trace-drawer and number-formatting fixes.

- **`use-span-prompts`**: a new `isGenerationSpan` predicate (matches `spanKind === "llm"` or the presence of a `model` field — a back-compat shim for older traces) now guards `isToolSpan` / `isAgentSpan`, fixing LLM generations being rendered as tool/agent nodes in the trace drawer.
- **`fCurrency`**: sub-precision non-zero values (e.g. `$0.0000001`) no longer round to `"$0"` — they render with up to 2 significant digits; invalid inputs return `''` before any formatting.
