---
'agentmark-prompt-core': patch
'@agentmark-ai/prompt-core': patch
---

Experiment item spans now record `agentmark.input` (the rendered system/user/assistant messages) for each dataset row, exactly as the run-prompt paths do — so a failed eval row shows the real messages the model received in the trace view, not just the raw dataset props (which stay on `agentmark.props` for re-runnable rows). Also fixes the Python experiment path double-encoding text output (`agentmark.output` was `json.dumps`'d, turning `hello` into `"hello"`), bringing it in line with the run-prompt path and the TS runner. Both runners are pinned by new experiment-path cases in the shared span-io conformance vectors.
