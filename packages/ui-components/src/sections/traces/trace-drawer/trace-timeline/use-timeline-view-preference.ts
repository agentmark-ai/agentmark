/**
 * useTimelineViewPreference Hook
 *
 * Manages user preference for graph vs timeline view with localStorage persistence.
 * Used by consuming applications to implement view toggle functionality.
 */

import { useState, useCallback, useEffect } from "react";

/** Available trace view types */
export type TraceViewType = "graph" | "timeline";

/** Storage key for view preference */
const STORAGE_KEY = "agentmark-trace-view-preference";

/** Default view */
const DEFAULT_VIEW: TraceViewType = "graph";

/**
 * Hook to manage trace view preference with localStorage persistence.
 *
 * @returns Current view, setter, and toggle function
 */
export function useTimelineViewPreference() {
  const [view, setViewState] = useState<TraceViewType>(() => {
    // Initialize from localStorage if available
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === "graph" || stored === "timeline") {
          return stored;
        }
      } catch {
        // localStorage not available or blocked
      }
    }
    return DEFAULT_VIEW;
  });

  // Persist to localStorage when view changes
  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, view);
      } catch {
        // localStorage not available or blocked
      }
    }
  }, [view]);

  /**
   * Set the view type.
   */
  const setView = useCallback((newView: TraceViewType) => {
    setViewState(newView);
  }, []);

  /**
   * Toggle between graph and timeline views.
   */
  const toggleView = useCallback(() => {
    setViewState((current) => (current === "graph" ? "timeline" : "graph"));
  }, []);

  return {
    /** Current view type */
    view,
    /** Set view to specific type */
    setView,
    /** Toggle between graph and timeline */
    toggleView,
    /** Whether current view is timeline */
    isTimeline: view === "timeline",
    /** Whether current view is graph */
    isGraph: view === "graph",
  };
}

export default useTimelineViewPreference;
