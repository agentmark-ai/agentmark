---
'@agentmark-ai/ui-components': minor
---

feat(traces): session IO overview — show every trace's top-level input/output together

In the session details drawer the right panel only ever showed ONE span's
input/output — to read a multi-step session (e.g. a sale moving cal -> day-of ->
prices, one trace per transition) you had to click each trace's root in turn.

New `SessionIoOverview` stacks the top-level Input/Output of EVERY trace in the
session into one scrollable view. Each card pulls its IO from the trace wrapper
node in `spanTree` (root-span data already merged up by the provider) and renders
it with the SAME extraction + display the single-span Input/Output tab uses, so a
card is identical to selecting that trace's root span.

The TraceTree and the overview cross-highlight via a shared `hoveredTraceId`,
kept in a dedicated hover context so a hover re-renders only the rows/cards that
read it — not every drawer consumer — and the highlight is a border/tint (no
box-shadow or size change), so hovering stays smooth. Additive — nothing outside
these views reads the hover state, so existing trace-detail views are unchanged.
The host (tenant-dashboard) renders the overview as the Details content when
viewing a session; drilling into a non-root span still shows that span's detail.
