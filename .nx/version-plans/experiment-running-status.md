---
'@agentmark-ai/api-schemas': minor
'@agentmark-ai/ui-components': minor
---

feat(experiments): placeholder states (`running` / `stalled`) on experiment summaries

`ExperimentSummarySchema` gains an optional `status` field so a backend can
surface a dispatched run whose spans haven't landed in analytics storage yet:
`"running"` while data is expected, `"stalled"` when none arrived (telemetry
likely not configured). The experiments list renders both as placeholders —
a status label next to the name, no stats, not clickable, excluded from
selection/compare and charts. Stalled rows render a warning label with an
explanatory tooltip and, when the new optional `onDismissExperiment` prop is
provided, a dismiss button. Rows without `status` render exactly as before,
so existing consumers are unaffected.
