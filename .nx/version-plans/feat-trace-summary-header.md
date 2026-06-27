---
'@agentmark-ai/ui-components': minor
---

Add a TraceSummaryHeader component to the trace detail drawer. The drawer subtitle now renders a compact metric row showing total cost, total tokens (with prompt→completion tooltip), wall-clock latency, distinct models used (as chips, capped at 3 + overflow count), user ID, and session ID — all derived from data already in memory, with no new API or schema changes. Fields with no value are omitted. Accompanies the new `summarizeTrace` pure helper exported from the utils barrel.
