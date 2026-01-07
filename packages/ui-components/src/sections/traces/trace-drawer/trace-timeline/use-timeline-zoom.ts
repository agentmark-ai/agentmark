/**
 * useTimelineZoom Hook
 *
 * Manages zoom and pan state for the timeline SVG viewport.
 * Supports mouse wheel zoom, drag-to-pan, and programmatic zoom controls.
 */

import { useState, useCallback, useRef } from "react";
import type { TimelineViewState, UseTimelineZoomResult } from "./timeline-types";
import { TIMELINE_CONSTANTS } from "./timeline-types";

const { MIN_SCALE, MAX_SCALE } = TIMELINE_CONSTANTS;

/** Zoom factor for each zoom step */
const ZOOM_FACTOR = 1.2;

/**
 * Hook to manage timeline zoom and pan state.
 *
 * @param contentWidth Total width of the timeline content
 * @param contentHeight Total height of the timeline content
 * @returns Zoom state and control handlers
 */
export function useTimelineZoom(
  contentWidth: number = 1000,
  contentHeight: number = 500
): UseTimelineZoomResult {
  const [viewState, setViewState] = useState<TimelineViewState>(() => ({
    viewBox: {
      x: 0,
      y: 0,
      width: contentWidth,
      height: contentHeight,
    },
    scale: 1,
    isPanning: false,
  }));

  // Track pan start position
  const panStartRef = useRef<{ x: number; y: number; viewBoxX: number; viewBoxY: number } | null>(
    null
  );

  /**
   * Clamp scale to valid range.
   */
  const clampScale = useCallback((scale: number): number => {
    return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
  }, []);

  /**
   * Zoom in by a factor.
   */
  const zoomIn = useCallback(() => {
    setViewState((prev) => {
      const newScale = clampScale(prev.scale * ZOOM_FACTOR);
      const scaleRatio = prev.scale / newScale;

      // Zoom toward center
      const centerX = prev.viewBox.x + prev.viewBox.width / 2;
      const centerY = prev.viewBox.y + prev.viewBox.height / 2;

      const newWidth = prev.viewBox.width * scaleRatio;
      const newHeight = prev.viewBox.height * scaleRatio;

      return {
        ...prev,
        viewBox: {
          x: centerX - newWidth / 2,
          y: centerY - newHeight / 2,
          width: newWidth,
          height: newHeight,
        },
        scale: newScale,
      };
    });
  }, [clampScale]);

  /**
   * Zoom out by a factor.
   */
  const zoomOut = useCallback(() => {
    setViewState((prev) => {
      const newScale = clampScale(prev.scale / ZOOM_FACTOR);
      const scaleRatio = prev.scale / newScale;

      // Zoom from center
      const centerX = prev.viewBox.x + prev.viewBox.width / 2;
      const centerY = prev.viewBox.y + prev.viewBox.height / 2;

      const newWidth = prev.viewBox.width * scaleRatio;
      const newHeight = prev.viewBox.height * scaleRatio;

      return {
        ...prev,
        viewBox: {
          x: centerX - newWidth / 2,
          y: centerY - newHeight / 2,
          width: newWidth,
          height: newHeight,
        },
        scale: newScale,
      };
    });
  }, [clampScale]);

  /**
   * Reset zoom to fit all content.
   */
  const resetZoom = useCallback(() => {
    setViewState({
      viewBox: {
        x: 0,
        y: 0,
        width: contentWidth,
        height: contentHeight,
      },
      scale: 1,
      isPanning: false,
    });
  }, [contentWidth, contentHeight]);

  /**
   * Set zoom to specific scale.
   */
  const setScale = useCallback(
    (scale: number) => {
      setViewState((prev) => {
        const newScale = clampScale(scale);
        const scaleRatio = prev.scale / newScale;

        const centerX = prev.viewBox.x + prev.viewBox.width / 2;
        const centerY = prev.viewBox.y + prev.viewBox.height / 2;

        const newWidth = prev.viewBox.width * scaleRatio;
        const newHeight = prev.viewBox.height * scaleRatio;

        return {
          ...prev,
          viewBox: {
            x: centerX - newWidth / 2,
            y: centerY - newHeight / 2,
            width: newWidth,
            height: newHeight,
          },
          scale: newScale,
        };
      });
    },
    [clampScale]
  );

  /**
   * Handle mouse wheel for zooming.
   * Note: We don't call preventDefault() to avoid passive event listener errors.
   * The zoom is applied via transform, not viewBox.
   */
  const onWheel = useCallback(
    (event: React.WheelEvent) => {
      // Don't prevent default - let the container scroll naturally
      // We only zoom if Ctrl/Cmd is held
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }

      // Try to prevent default for zoom (may fail on passive listeners)
      try {
        event.preventDefault();
      } catch {
        // Ignore - passive event listener
      }

      const svg = event.currentTarget as SVGSVGElement | null;
      if (!svg) return;

      const rect = svg.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;

      const delta = event.deltaY;
      const zoomDirection = delta > 0 ? -1 : 1; // Scroll down = zoom out, scroll up = zoom in

      setViewState((prev) => {
        const factor = zoomDirection > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
        const newScale = clampScale(prev.scale * factor);

        if (newScale === prev.scale) {
          return prev;
        }

        const scaleRatio = prev.scale / newScale;

        // Get mouse position relative to SVG
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Convert mouse position to viewBox coordinates
        const viewBoxMouseX = prev.viewBox.x + (mouseX / rect.width) * prev.viewBox.width;
        const viewBoxMouseY = prev.viewBox.y + (mouseY / rect.height) * prev.viewBox.height;

        // Calculate new viewBox dimensions
        const newWidth = prev.viewBox.width * scaleRatio;
        const newHeight = prev.viewBox.height * scaleRatio;

        // Adjust viewBox position to zoom toward mouse cursor
        const newX = viewBoxMouseX - (mouseX / rect.width) * newWidth;
        const newY = viewBoxMouseY - (mouseY / rect.height) * newHeight;

        return {
          ...prev,
          viewBox: {
            x: newX,
            y: newY,
            width: newWidth,
            height: newHeight,
          },
          scale: newScale,
        };
      });
    },
    [clampScale]
  );

  /**
   * Handle mouse down to start panning.
   */
  const onMouseDown = useCallback((event: React.MouseEvent) => {
    // Only pan on primary button (left click)
    if (event.button !== 0) return;

    event.preventDefault();

    setViewState((prev) => {
      panStartRef.current = {
        x: event.clientX,
        y: event.clientY,
        viewBoxX: prev.viewBox.x,
        viewBoxY: prev.viewBox.y,
      };

      return {
        ...prev,
        isPanning: true,
      };
    });
  }, []);

  /**
   * Handle mouse move during panning.
   */
  const onMouseMove = useCallback((event: React.MouseEvent) => {
    if (!panStartRef.current) return;

    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();

    const deltaX = event.clientX - panStartRef.current.x;
    const deltaY = event.clientY - panStartRef.current.y;

    setViewState((prev) => {
      // Convert pixel delta to viewBox units
      const viewBoxDeltaX = (deltaX / rect.width) * prev.viewBox.width;
      const viewBoxDeltaY = (deltaY / rect.height) * prev.viewBox.height;

      return {
        ...prev,
        viewBox: {
          ...prev.viewBox,
          x: panStartRef.current!.viewBoxX - viewBoxDeltaX,
          y: panStartRef.current!.viewBoxY - viewBoxDeltaY,
        },
      };
    });
  }, []);

  /**
   * Handle mouse up to stop panning.
   */
  const onMouseUp = useCallback(() => {
    panStartRef.current = null;
    setViewState((prev) => ({
      ...prev,
      isPanning: false,
    }));
  }, []);

  /**
   * Handle mouse leave to stop panning.
   */
  const onMouseLeave = useCallback(() => {
    if (panStartRef.current) {
      panStartRef.current = null;
      setViewState((prev) => ({
        ...prev,
        isPanning: false,
      }));
    }
  }, []);

  return {
    viewState,
    zoomIn,
    zoomOut,
    resetZoom,
    setScale,
    onWheel,
    panHandlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
    },
  };
}

export default useTimelineZoom;
