import {
  TraceDrawerProvider,
  TraceDrawerContainer,
  TraceDrawerHeader,
  TraceDrawerTitle,
  TraceDrawerSubtitle,
  TraceTree,
  TraceGraphCanvas,
  SpanInfoProvider,
  SpanInfoHeader,
  SpanInfoContent,
  SpanInfoTabs,
  AttributesTab,
  InputOutputTab,
  EvaluationProvider,
  EvaluationTab,
  EvaluationList,
  TraceDrawer as TraceDrawerComponent,
  TraceData,
  TraceInfoSkeleton,
  ScoreData,
  SpanData,
  TraceTimeline,
} from "@agentmark-ai/ui-components";
import { Box, Stack, Typography, Tabs, Tab } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getTraceById, getTraceGraph, GraphData } from "../../lib/api/traces";
import { getScoresByResourceId } from "../../lib/api/scores";

/** Available view tabs */
type ViewTab = "timeline" | "graph" | "details";

export const TraceDrawer = ({ t }: { t: (key: string) => string }) => {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [currentSpanId, setCurrentSpanId] = useState<string | null>(null);

  // Tab state for Timeline | Graph | Details view
  const [activeTab, setActiveTab] = useState<ViewTab>("timeline");
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();

  // Resizable sidebar state
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const searchParams = useSearchParams();
  const traceId = searchParams.get("traceId");
  const router = useRouter();

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      setLoading(false);
      setError(null);
      setGraphData([]);
      return;
    }

    const fetchTrace = async () => {
      setLoading(true);
      setError(null);
      const fetchedTrace = await getTraceById(traceId);
      if (!fetchedTrace) {
        setError("Trace not found");
        setTrace(null);
      } else {
        setTrace(fetchedTrace);
      }
      setLoading(false);
    };
    fetchTrace();
  }, [traceId]);

  useEffect(() => {
    if (!traceId) {
      setGraphData([]);
      setGraphLoading(false);
      return;
    }

    const fetchGraphData = async () => {
      setGraphLoading(true);
      try {
        const data = await getTraceGraph(traceId);
        setGraphData(data);
      } catch (error) {
        console.error("Error fetching graph data:", error);
        setGraphData([]);
      } finally {
        setGraphLoading(false);
      }
    };
    fetchGraphData();
  }, [traceId]);

  // Reset state when trace changes
  useEffect(() => {
    if (traceId) {
      setSelectedSpanId(undefined);
      setActiveTab("timeline");
    }
  }, [traceId]);

  const handleSpanChange = async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }

    setCurrentSpanId(span.id);
    setSelectedSpanId(span.id);

    try {
      if (span.id !== currentSpanId) {
        setScoresLoading(true);
        const fetchedScores = await getScoresByResourceId(span.id);
        setScores(fetchedScores);
      }
    } catch (error) {
      console.error("Error fetching scores:", error);
      setScores([]);
    } finally {
      setScoresLoading(false);
    }
  };

  // Handle span selection from Timeline or Graph - switch to Details tab
  const handleSpanSelect = useCallback((spanId: string) => {
    setSelectedSpanId(spanId);
    setActiveTab("details");
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, newValue: ViewTab) => {
    setActiveTab(newValue);
  };

  // Sidebar resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.max(200, Math.min(600, resizeRef.current.startWidth + delta));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  const traces = useMemo(() => {
    return trace ? [trace] : [];
  }, [trace]);

  // Get spans from the current trace for the timeline
  const spans = useMemo(() => {
    return trace?.spans || [];
  }, [trace]);

  // Timeline tab content
  const renderTimelineTab = () => (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <TraceTimeline
        spans={spans}
        selectedSpanId={selectedSpanId}
        onSelectSpan={handleSpanSelect}
        showRuler
        showLegend
        enableZoom
        enablePan
      />
    </Box>
  );

  // Graph tab content
  const renderGraphTab = () => (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <TraceGraphCanvas graphData={graphData} isLoading={graphLoading} />
    </Box>
  );

  // Details tab content
  const renderDetailsTab = () => (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      {selectedSpanId ? (
        <SpanInfoProvider>
          <SpanInfoHeader />
          <SpanInfoContent>
            <SpanInfoTabs>
              <AttributesTab />
              <InputOutputTab />
              <EvaluationProvider
                canAddAnnotation={false}
                scores={scores}
                isLoading={scoresLoading}
              >
                <EvaluationTab>
                  <Stack spacing={2}>
                    <EvaluationList />
                  </Stack>
                </EvaluationTab>
              </EvaluationProvider>
            </SpanInfoTabs>
          </SpanInfoContent>
        </SpanInfoProvider>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">
            Select a span from Timeline or Graph to view details
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <TraceDrawerProvider
      traces={traces}
      traceId={traceId || undefined}
      t={t}
      onSpanChange={handleSpanChange}
    >
      <TraceDrawerComponent
        open={!!traceId}
        onClose={() => {
          const params = new URLSearchParams(searchParams.toString());
          params.delete("traceId");
          const newUrl = params.toString() ? `/traces?${params.toString()}` : "/traces";
          router.push(newUrl);
        }}
      >
        {loading && <TraceInfoSkeleton />}
        {error && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        {!loading && !error && trace && (
          <TraceDrawerContainer>
            <TraceDrawerHeader>
              <Stack direction="row" justifyContent="space-between">
                <TraceDrawerTitle>{t("title")}</TraceDrawerTitle>
              </Stack>
              <TraceDrawerSubtitle />
            </TraceDrawerHeader>

            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                width: "100%",
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                userSelect: isResizing ? "none" : "auto",
              }}
            >
              {/* Left sidebar: TraceTree (always visible for navigation) */}
              <Box
                sx={{
                  width: sidebarWidth,
                  minWidth: 200,
                  maxWidth: 600,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  position: "relative",
                  flexShrink: 0,
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    backgroundColor: "action.hover",
                  }}
                >
                  <Typography variant="subtitle2">Spans</Typography>
                </Box>
                <Box sx={{ flex: 1, overflow: "auto", minHeight: 0 }}>
                  <TraceTree />
                </Box>
                {/* Resize handle */}
                <Box
                  onMouseDown={handleResizeStart}
                  sx={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: 4,
                    cursor: "col-resize",
                    backgroundColor: isResizing ? "primary.main" : "transparent",
                    borderRight: 1,
                    borderColor: "divider",
                    transition: "background-color 0.15s",
                    "&:hover": {
                      backgroundColor: "primary.light",
                    },
                    zIndex: 10,
                  }}
                />
              </Box>

              {/* Main content area with tabs */}
              <Box
                sx={{
                  flex: 1,
                  minWidth: 0,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Tab bar */}
                <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    aria-label="Trace view tabs"
                  >
                    <Tab label="Timeline" value="timeline" />
                    <Tab label="Graph" value="graph" />
                    <Tab label="Details" value="details" />
                  </Tabs>
                </Box>

                {/* Tab content */}
                <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {activeTab === "timeline" && renderTimelineTab()}
                  {activeTab === "graph" && renderGraphTab()}
                  {activeTab === "details" && renderDetailsTab()}
                </Box>
              </Box>
            </Box>
          </TraceDrawerContainer>
        )}
      </TraceDrawerComponent>
    </TraceDrawerProvider>
  );
};
