---
'@agentmark-ai/cli': patch
---

fix(cli): derive trace-level input/output on local GET /v1/traces/:id

The local dev server's trace-detail route maps getTraceById →
mapRawTraceToDetail → toTraceDetailWire, but mapRawTraceToDetail never
populated `TraceDetail.input`/`output` (getTraceById's SQL doesn't
aggregate them), and toTraceDetailWire omits undefined keys — so the
local wire response never carried trace-level I/O. This made `doctor
--smoke`'s traceShape check (`trace.input == null` / `trace.output ==
null`) structurally unsatisfiable against the local server, failing for
every project regardless of wiring.

mapRawTraceToDetail now mirrors the cloud gateway's
transformTraceDetail: trace input = first GENERATION span's input,
trace output = last GENERATION span's output, in timestamp order.
