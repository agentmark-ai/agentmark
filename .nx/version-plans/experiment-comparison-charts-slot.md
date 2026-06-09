---
'@agentmark-ai/ui-components': minor
---

feat(experiments): move comparison charts off the single-experiment detail view

`ExperimentCharts` is a cross-experiment comparison viz (x-axis = experiment
names, plotted as a line per metric). On the single-experiment detail page it
was fed a one-element array, so each chart rendered a single, lineless marker —
a comparison chart with nothing to compare. The charts now belong on the
multi-experiment comparison view instead.

- `ExperimentComparison` gains an optional `chartsSlot` prop, rendered between
  the summary banner and the comparison table (same slot pattern as
  `ExperimentDetailView` and `ExperimentsList`). Additive and optional, so this
  is a minor bump.
