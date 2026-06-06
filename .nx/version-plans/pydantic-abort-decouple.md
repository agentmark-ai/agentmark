---
"agentmark-pydantic-ai-v0": patch
---

Fix the abort contract on pydantic-ai >= 1.57: streaming text runs are now
iterated inside a dedicated producer task (`_decouple`), so a consumer
closing the stream mid-flight (client disconnect) cancels the pydantic-ai
run as a task instead of throwing `GeneratorExit` into the
`agent.iter()` stack — which the capabilities `wrap_run` hand-off
introduced in pydantic-ai 1.57+ swallows mid-unwind, surfacing as
`RuntimeError: async generator ignored GeneratorExit` plus leaked
`Agent.iter`/`Graph.iter` async generators. Verified against both
pydantic-ai 1.56.0 and 1.106.0; no wire or API changes.
