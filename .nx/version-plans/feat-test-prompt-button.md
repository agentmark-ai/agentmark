---
"@agentmark-ai/ui-components": minor
"@agentmark-ai/cli": minor
---

Add "Test prompt" button to the trace drawer, surfacing the originating prompt's name/variables directly from a span:

- `@agentmark-ai/ui-components`: New `TestPromptDialog` component plus `buildRunPromptCommand` (and `singleQuoteShellEscape` helper) under `./sections/traces/components`. New `extractSpanPromptName` and `extractSpanTemplateProps` helpers in `./sections/traces/utils/extract-span-data`. All additive — existing exports unchanged.
- `@agentmark-ai/cli`: Dashboard wires the new "Test prompt" button into the trace drawer; new `src/lib/api/prompts.ts` client + `src/lib/api/traces.ts` extensions for prompt resolution and wire-shape utilities used by the dialog.
