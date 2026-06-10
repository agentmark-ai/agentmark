---
'agentmark-sdk': minor
---

feat(sdk-python): @observe supports generator and async-generator functions

Decorating a generator function with @observe previously took the plain
sync path: the span ended when the generator OBJECT was created (before
any item was produced), the output captured the generator's repr, and the
actual streaming work ran outside the span. Generator and async-generator
functions now get dedicated wrappers: the span stays open until the
stream is exhausted, producer steps run under the span's context (model
spans parent correctly) while consumer code between yields does not (no
context leak), and the output is the aggregated yields — concatenated
when all items are strings (the LLM text-delta shape), the item list
otherwise. Errors mid-stream mark the span ERROR; abandoned streams
(GeneratorExit) still end the span.
