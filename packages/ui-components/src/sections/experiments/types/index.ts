/**
 * Experiment Types
 *
 * Type definitions for experiment UI components.
 *
 * The four core types (ExperimentItemScore, ExperimentSummary,
 * ExperimentItemSummary, ExperimentDetail) are owned by
 * `@agentmark-ai/api-schemas` (inferred from Zod schemas) and re-exported
 * here for backward compatibility. The comparison-table types below remain
 * UI-local — they describe rendered table state, not wire shapes.
 */

// ---------------------------------------------------------------------------
// Core Experiment Types — re-exported from the canonical source.
// ---------------------------------------------------------------------------

import type { ExperimentItemScore } from '@agentmark-ai/api-schemas';

export type {
  ExperimentItemScore,
  ExperimentSummary,
  ExperimentItemSummary,
  ExperimentDetail,
} from '@agentmark-ai/api-schemas';

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

/** Filter options for the comparison table */
export type ComparisonFilterMode = 'all' | 'regressed' | 'improved' | 'unchanged';
