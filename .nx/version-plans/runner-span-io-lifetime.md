---
'@agentmark-ai/prompt-core': minor
'agentmark-prompt-core': minor
---

fix(runner): keep the prompt span open until streams drain; record span I/O in both runners

The WebhookRunner's prompt span ended as soon as the executor's lazy
iterable was created — before the model call ran — in the streaming path
of both runners and the non-streaming path of the TS runner. Model spans
were created outside the prompt span (orphaned into a separate trace,
patched over only by the local server's SessionId-based virtual
hierarchy), the wrapper span's duration was meaningless (~5ms), and
streamed runs never recorded `agentmark.output`.

Both runners now end the prompt span when the event stream drains: the
Python NDJSON generators take ownership of the span context manager, and
the TS streaming path resolves the span-hook callback only after the
wire-stream pump completes (TS non-streaming now drains inside the hook,
so failed runs also mark the span ERROR).

The runner — never executors — now records `agentmark.input` (the
formatted {role, content} messages, JSON) on the prompt span right after
format(), and `agentmark.output` after drain, in BOTH streaming and
non-streaming modes. This is what trace-level I/O derivation reads first.

Cross-language contract pinned by new shared conformance vectors
(`conformance-vectors/vectors/span-io.json`) run by both suites — all six
cases fail against the previous runner behavior.
