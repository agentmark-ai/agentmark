---
'@agentmark-ai/api-types': patch
---

Add `userId` and `sessionId` fields to the `TraceDetail` interface. These are now populated by the observability service from the root span's ClickHouse columns (`UserId`, `SessionId`) and surfaced through the trace drawer's summary header.
