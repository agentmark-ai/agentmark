---
'@agentmark-ai/api-types': minor
'@agentmark-ai/ui-components': minor
---

Add `TraceSummaryHeader` component to the trace drawer that surfaces
trace-level cost, token count (with prompt→completion breakdown), wall-clock
latency, distinct models used (as chips), user ID, and session ID — closing
LangFuse parity gaps 1, 6, and 7.

`@agentmark-ai/api-types`: `TraceDetail` gains optional `userId` and
`sessionId` string fields so the observability service can carry user context
from ClickHouse through to the dashboard.

`@agentmark-ai/ui-components`: new `TraceSummaryHeader` component (exported
from the `trace-drawer` barrel) and `summarizeTrace` pure helper (exported
from the `utils` barrel) that aggregates cost, tokens, latency, models, and
user context from a `TraceData` value already in memory — no extra fetches
required.
