/**
 * React-free utility entry point for @agentmark-ai/ui-components.
 *
 * This barrel re-exports only PURE FUNCTIONS — no React/MUI/@emotion in
 * the transitive import graph and no module-level side effects.
 *
 * Consumers that only need helpers (test environments with
 * `environment: 'node'`, the dashboard's `comparison-utils.ts` re-export,
 * downstream services that need formatting helpers) should import from
 * `@agentmark-ai/ui-components/utilities` instead of the main barrel.
 *
 * If you add a new helper, it MUST:
 *   1. Live in (or be re-exported from) a `.ts` file with no React/JSX.
 *   2. Have no module-level side effects.
 *   3. Import only from other pure modules (or from leaf libraries that
 *      do not pull React, e.g. `numeral`, `dagre`).
 *
 * The test `test/exports-map-react-free.test.ts` enforces React-freedom
 * of this entry point and will fail CI if anything React-tainted leaks
 * in.
 *
 * NOTE: utilities that depend on `@xyflow/react` (e.g. graph-layout,
 * branch-families, MUI-themed node-styling) are intentionally excluded
 * because they pull React. They remain available via the main barrel.
 */

// Number formatting — depends only on `numeral`.
export { fNumber, fCurrency, fPercent, fShortenNumber, fData } from "../utils";

// Experiment comparison helpers — depend only on type imports.
export {
  buildComparisonRows,
  computeScoreDeltas,
  computeComparisonSummary,
  sortComparisonRows,
  toComparisonItemData,
} from "../sections/experiments/experiment-comparison/comparison-utils";

// Span grouping / classification — depends only on its own types.
export {
  makeGroupKey,
  groupSpansByKey,
  inferNodeType,
  getDisplayName,
  hasChildSpans,
} from "../sections/traces/utils/span-grouping";

// Span data extraction — pure JSON parsing helpers.
export {
  extractSpanInput,
  extractSpanExpectedOutput,
  getSpanInputKind,
} from "../sections/traces/utils/extract-span-data";

// OTel-style attribute transformer — pure mapping over a plain object.
export { transformAttributes } from "../sections/traces/utils/attribute-transformer";

// Re-export the pure-utility types alongside the helpers, so callers
// don't need to import from two subpaths to use them.
export type {
  SpanForGrouping,
  WorkflowNodeType,
  NodeGroup,
} from "../sections/traces/utils/span-grouping";
export type { DatasetInputKind } from "../sections/traces/utils/extract-span-data";
