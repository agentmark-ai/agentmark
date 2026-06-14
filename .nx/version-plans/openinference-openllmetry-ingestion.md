---
'@agentmark-ai/shared-utils': minor
---

Extract IO, model, tokens, settings, tool calls and trace context from OpenInference- and OpenLLMetry/Traceloop-instrumented spans. A new signature-dispatching default transformer routes spans by attribute shape (these ecosystems each emit dozens of distinct OTel scope names, so they can't be scope-registered), falling back to the OTel GenAI semantic conventions when neither matches. Unlocks trace ingestion for the OpenInference (LangChain, LlamaIndex, OpenAI Agents SDK, CrewAI, DSPy, Haystack, …) and OpenLLMetry/OpenLIT (AutoGen, Semantic Kernel, Agno, …) instrumentor catalogs without per-framework work.
