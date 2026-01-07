/**
 * useTimelineLayout Hook
 *
 * React hook wrapper around computeTimelineLayout.
 * Provides memoization for performance optimization.
 */

import { useMemo } from "react";
import type { SpanData } from "../../types";
import type { UseTimelineLayoutResult } from "./timeline-types";
import { computeTimelineLayout } from "./compute-timeline-layout";

/**
 * Hook to compute timeline layouts from span data.
 *
 * @param spans Array of span data to visualize
 * @returns Computed layouts, metrics, and ruler ticks
 */
export function useTimelineLayout(spans: SpanData[]): UseTimelineLayoutResult {
  return useMemo(() => computeTimelineLayout(spans), [spans]);
}

export default useTimelineLayout;
