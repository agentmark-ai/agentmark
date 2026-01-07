/**
 * TimelineErrorBoundary Component
 *
 * Error boundary to gracefully handle rendering errors in the timeline.
 * Prevents crashes from malformed span data from breaking the entire UI.
 */

import React, { Component, type ReactNode } from "react";
import { Box, Typography, Button } from "@mui/material";

interface TimelineErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface TimelineErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary for the timeline component.
 * Catches rendering errors and displays a fallback UI.
 */
export class TimelineErrorBoundary extends Component<
  TimelineErrorBoundaryProps,
  TimelineErrorBoundaryState
> {
  constructor(props: TimelineErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): TimelineErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error for debugging
    console.error("Timeline rendering error:", error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box
          sx={{
            p: 3,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            minHeight: 200,
            color: "text.secondary",
            textAlign: "center",
          }}
        >
          <Typography variant="body1" color="error" gutterBottom>
            Failed to render timeline
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            There was an error processing the span data.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            onClick={this.handleRetry}
          >
            Retry
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default TimelineErrorBoundary;
