---
'@agentmark-ai/prompt-core': patch
'@agentmark-ai/cli': patch
'@agentmark-ai/sdk': patch
---

A streamed prompt run that errors mid-stream now marks the prompt span ERROR, matching the non-streaming path. Previously the streaming run paths (text + object) reported the executor error to the caller as a wire error chunk but closed the span clean, so a failed production run looked successful in the trace (status OK). The streaming generators now capture the error and close the span with it — the wire error chunk is unchanged, only the span status. Mirrored in `prompt-core-python`.
