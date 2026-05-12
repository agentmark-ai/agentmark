---
"@agentmark-ai/cli": minor
---

**BREAKING:** Remove `agentmark export traces` command.

The cloud gateway's `GET /v1/traces/export` endpoint has been deleted as part of the trace-API consolidation — the surface is now `GET /v1/traces` with filters, matching the industry convention (Langfuse, LangSmith, Arize). Client-side JSONL/CSV/OpenAI-format conversion is a three-line loop; see the `GET /v1/traces` docs for the replacement pattern.
