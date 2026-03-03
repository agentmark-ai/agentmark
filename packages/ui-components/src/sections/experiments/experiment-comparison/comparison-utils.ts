/**
 * Comparison Utilities
 *
 * Pure utility functions for experiment comparison logic.
 * No side effects — all functions are deterministic and testable.
 */

import type {
  ExperimentDetail,
  ExperimentItemSummary,
  ExperimentItemScore,
  ComparisonRow,
  ComparisonItemData,
  ScoreDelta,
  ComparisonSummary,
  ComparisonSortMode,
} from '../types';

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

/**
 * Maps an ExperimentItemSummary to ComparisonItemData.
 */
export function toComparisonItemData(item: ExperimentItemSummary): ComparisonItemData {
  return {
    traceId: item.traceId,
    output: item.output,
    input: item.input,
    expectedOutput: item.expectedOutput,
    latencyMs: item.latencyMs,
    cost: item.cost,
    tokens: item.tokens,
    model: item.model,
    scores: item.scores,
  };
}

// ---------------------------------------------------------------------------
// Score Deltas
// ---------------------------------------------------------------------------

/**
 * Computes score deltas between baseline and comparison experiment items.
 */
export function computeScoreDeltas(
  baselineScores: ExperimentItemScore[],
  comparisonScores: ExperimentItemScore[]
): ScoreDelta[] {
  const baselineMap = new Map<string, number>();
  for (const s of baselineScores) {
    baselineMap.set(s.name, s.score);
  }

  const deltas: ScoreDelta[] = [];

  for (const cs of comparisonScores) {
    const baselineValue = baselineMap.get(cs.name);
    if (baselineValue === undefined) {
      continue;
    }

    const delta = cs.score - baselineValue;

    let status: ScoreDelta['status'];
    if (delta > 0) {
      status = 'improved';
    } else if (delta < 0) {
      status = 'regressed';
    } else {
      status = 'unchanged';
    }

    deltas.push({
      scoreName: cs.name,
      baselineValue,
      comparisonValue: cs.score,
      delta,
      status,
    });
  }

  return deltas;
}

// ---------------------------------------------------------------------------
// Build Comparison Rows
// ---------------------------------------------------------------------------

/**
 * Builds comparison rows from an array of experiment details.
 */
export function buildComparisonRows(experiments: ExperimentDetail[]): ComparisonRow[] {
  if (experiments.length === 0) {
    return [];
  }

  const itemsByExperiment = new Map<string, Map<string, ExperimentItemSummary>>();
  const allItemNames = new Set<string>();

  for (const exp of experiments) {
    const itemMap = new Map<string, ExperimentItemSummary>();
    for (const item of exp.items) {
      itemMap.set(item.itemName, item);
      allItemNames.add(item.itemName);
    }
    itemsByExperiment.set(exp.id, itemMap);
  }

  const baselineExperiment = experiments[0];
  if (!baselineExperiment) {
    return [];
  }
  const baselineId = baselineExperiment.id;
  const sortedNames = Array.from(allItemNames).sort();

  return sortedNames.map((itemName) => {
    const experimentsMap: Record<string, ComparisonItemData | null> = {};

    for (const exp of experiments) {
      const itemMap = itemsByExperiment.get(exp.id);
      const item = itemMap?.get(itemName) ?? null;
      experimentsMap[exp.id] = item ? toComparisonItemData(item) : null;
    }

    let scoreDeltas: ScoreDelta[] = [];
    const baselineItem = itemsByExperiment.get(baselineId)?.get(itemName);

    const secondExperiment = experiments[1];
    if (baselineItem && secondExperiment) {
      const comparisonItem = itemsByExperiment.get(secondExperiment.id)?.get(itemName);
      if (comparisonItem) {
        scoreDeltas = computeScoreDeltas(baselineItem.scores, comparisonItem.scores);
      }
    }

    return {
      itemName,
      experiments: experimentsMap,
      scoreDeltas,
    };
  });
}

// ---------------------------------------------------------------------------
// Comparison Summary
// ---------------------------------------------------------------------------

/**
 * Computes summary statistics for a set of comparison rows.
 */
export function computeComparisonSummary(
  rows: ComparisonRow[],
  experimentIds: string[]
): ComparisonSummary {
  let overlappingItems = 0;
  let improved = 0;
  let regressed = 0;
  let unchanged = 0;
  let unscored = 0;

  for (const row of rows) {
    const presentInAll = experimentIds.every((id) => row.experiments[id] != null);
    if (presentInAll) {
      overlappingItems++;
    }

    if (row.scoreDeltas.length === 0) {
      unscored++;
    } else {
      const hasImproved = row.scoreDeltas.some((d) => d.status === 'improved');
      const hasRegressed = row.scoreDeltas.some((d) => d.status === 'regressed');

      if (hasRegressed) {
        regressed++;
      } else if (hasImproved) {
        improved++;
      } else {
        unchanged++;
      }
    }
  }

  return {
    totalItems: rows.length,
    overlappingItems,
    improved,
    regressed,
    unchanged,
    unscored,
  };
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function avgDelta(row: ComparisonRow): number {
  if (row.scoreDeltas.length === 0) {
    return 0;
  }
  const sum = row.scoreDeltas.reduce((acc, d) => acc + d.delta, 0);
  return sum / row.scoreDeltas.length;
}

/**
 * Returns a new array of comparison rows sorted by the given mode.
 */
export function sortComparisonRows(
  rows: ComparisonRow[],
  mode: ComparisonSortMode
): ComparisonRow[] {
  const sorted = [...rows];

  switch (mode) {
    case 'item-name':
      sorted.sort((a, b) => a.itemName.localeCompare(b.itemName));
      break;

    case 'regressions-first':
      sorted.sort((a, b) => {
        const da = avgDelta(a);
        const db = avgDelta(b);
        if (da !== db) {
          return da - db;
        }
        return a.itemName.localeCompare(b.itemName);
      });
      break;

    case 'improvements-first':
      sorted.sort((a, b) => {
        const da = avgDelta(a);
        const db = avgDelta(b);
        if (da !== db) {
          return db - da;
        }
        return a.itemName.localeCompare(b.itemName);
      });
      break;

    case 'delta-abs':
      sorted.sort((a, b) => {
        const absA = Math.abs(avgDelta(a));
        const absB = Math.abs(avgDelta(b));
        if (absA !== absB) {
          return absB - absA;
        }
        return a.itemName.localeCompare(b.itemName);
      });
      break;

    default: {
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }

  return sorted;
}
