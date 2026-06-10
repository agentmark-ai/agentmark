---
'@agentmark-ai/prompt-core': minor
'agentmark-prompt-core': minor
'agentmark-sdk': patch
---

feat(runner): stamp model and usage on the prompt span

The runner now records `gen_ai.request.model` (from the prompt's
frontmatter config, adapter-agnostic) on the prompt span at start, and
`gen_ai.usage.input_tokens`/`gen_ai.usage.output_tokens` (integers, from
the executor's finish-event usage) after drain — in both runners, on
streaming and non-streaming paths.

Executors built on raw SDKs with no OTEL GenAI instrumentation (boto3
Bedrock, raw OpenAI/Anthropic clients) previously produced traces with
no model on any span and no token counts, failing `doctor --smoke`'s
traceShape check. With the runner stamping what it already knows, any
raw-SDK executor is fully doctor-green with zero instrumentation. The
prompt span stays type SPAN, so GENERATION-only rollups never
double-count it when instrumented model spans also exist.

`SpanLike.set_attribute`/`setAttribute` contracts widened to accept
numeric values (the normalizer only parses numeric token attributes).
Pinned by the extended span-io conformance vectors in both languages.

Also fixes AgentmarkSampler (agentmark-sdk, Python): per the OTel spec
the sampler result replaces a span's create-time attributes, and the
sampler returned a bare RECORD_AND_SAMPLE decision — silently stripping
every attribute passed at span creation (notably gen_ai.* attributes
from instrumentation libraries such as botocore's Bedrock extension,
which degraded to generic RPC spans with no model). The sampler now
forwards the caller's attributes and parent trace_state.
