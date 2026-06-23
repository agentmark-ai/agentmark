---
'@agentmark-ai/prompt-core': patch
'@agentmark-ai/cli': patch
'@agentmark-ai/sdk': patch
---

`run-prompt` now records the template variables it was rendered with as the `agentmark.props` span attribute — the same attribute the experiment item span already emits. Previously only the rendered messages (`agentmark.input`) were stamped on a `run-prompt` span, so `run-prompt --props` traces had no Variables panel and their "Add to dataset" fell back to the rendered messages instead of the re-runnable variables.

The fix lives in the prompt-core webhook runner (a new `setSpanProps` helper invoked from all six prompt-run paths — text/object × streaming/non-streaming, image, speech), and is mirrored in `prompt-core-python` (`_set_span_props`, four run paths). No-op when there are no props. This brings `run-prompt` to parity with `run-experiment`: both surface the prompt variables and capture them (not the rendered messages) on import.
