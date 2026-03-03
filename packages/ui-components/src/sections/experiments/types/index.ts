/**
 * Experiment Types
 *
 * Type definitions for experiment UI components.
 * These types are the canonical source — the dashboard re-exports them.
 */

// ---------------------------------------------------------------------------
// Core Experiment Types
// ---------------------------------------------------------------------------

/** Score on a single experiment item */
export interface ExperimentItemScore {
  name: string;
  score: number;
  label: string;
  reason: string;
}

/** Summary for list views (from analytics) */
export interface ExperimentSummary {
  id: string;
  name: string;
  datasetPath: string;
  promptName: string;
  start: string;
  end: string;
  itemCount: number;
  avgLatencyMs: number;
  totalCost: number;
  totalTokens: number;
  avgScore: number | null;
}

/** Single item in experiment */
export interface ExperimentItemSummary {
  traceId: string;
  itemName: string;
  expectedOutput: string;
  input: string;
  output: string;
  latencyMs: number;
  cost: number;
  tokens: number;
  model: string;
  scores: ExperimentItemScore[];
}

/** Full detail with all items */
export interface ExperimentDetail extends ExperimentSummary {
  items: ExperimentItemSummary[];
}

// ---------------------------------------------------------------------------
// Comparison Types
// ---------------------------------------------------------------------------

/** Data for one experiment's version of a dataset item in the comparison */
export interface ComparisonItemData {
  traceId: string;
  output: string;
  input: string;
  expectedOutput: string;
  latencyMs: number;
  cost: number;
  tokens: number;
  model: string;
  scores: ExperimentItemScore[];
}

/** Score difference between baseline and comparison experiment for a specific score name */
export interface ScoreDelta {
  scoreName: string;
  baselineValue: number;
  comparisonValue: number;
  delta: number;
  status: 'improved' | 'regressed' | 'unchanged';
}

/** One row in the comparison table */
export interface ComparisonRow {
  itemName: string;
  experiments: Record<string, ComparisonItemData | null>;
  scoreDeltas: ScoreDelta[];
}

/** Summary statistics for the comparison */
export interface ComparisonSummary {
  totalItems: number;
  overlappingItems: number;
  improved: number;
  regressed: number;
  unchanged: number;
  unscored: number;
}

/** A segment of a word-level diff output */
export interface DiffSegment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** Sort options for the comparison table */
export type ComparisonSortMode = 'item-name' | 'regressions-first' | 'improvements-first' | 'delta-abs';
