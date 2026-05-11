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
  findRootSpans,
  extractSpanInput,
  extractSpanExpectedOutput,
  extractSpanPromptName,
  extractSpanTemplateProps,
  TestPromptDialog,
} from "@agentmark-ai/ui-components";
import { Box, Stack, Typography, Tabs, Tab, Button, Tooltip } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { getTraceById, getTraceGraph, GraphData } from "../../lib/api/traces";
import { getScoresByResourceId } from "../../lib/api/scores";
import { getSpanIO } from "../../lib/api/spans";
import { getPromptPathByName } from "../../lib/api/prompts";
import { AddToDatasetDialog } from "./add-to-dataset-dialog";

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
  const currentSpanIdRef = useRef<string | null>(null);

  // Tab state for Details | Graph | Timeline view
  const [activeTab, setActiveTab] = useState<ViewTab>("details");
  const activeTabRef = useRef<ViewTab>(activeTab);
  activeTabRef.current = activeTab;
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

    // Guard against stale responses: when the user clicks trace A then
    // quickly clicks trace B, A's pending fetch can resolve AFTER B's
    // and overwrite B's data. The cancelled flag is captured by the
    // closure and flipped in the cleanup, so a late-arriving response
    // for a previous traceId is dropped instead of clobbering state.
    let cancelled = false;
    const fetchTrace = async () => {
      setLoading(true);
      setError(null);
      const fetchedTrace = await getTraceById(traceId);
      if (cancelled) return;
      if (!fetchedTrace) {
        setError("Trace not found");
        setTrace(null);
      } else {
        setTrace(fetchedTrace);
      }
      setLoading(false);
    };
    fetchTrace();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  useEffect(() => {
    if (!traceId) {
      setGraphData([]);
      setGraphLoading(false);
      return;
    }

    // Same stale-response guard as the trace fetch above — the graph
    // and the detail are two independent network calls and either can
    // overtake the other when the user switches traces quickly.
    let cancelled = false;
    const fetchGraphData = async () => {
      setGraphLoading(true);
      try {
        const data = await getTraceGraph(traceId);
        if (cancelled) return;
        setGraphData(data);
      } catch (error) {
        console.error("Error fetching graph data:", error);
        if (cancelled) return;
        setGraphData([]);
      } finally {
        if (cancelled) return;
        setGraphLoading(false);
      }
    };
    fetchGraphData();
    return () => {
      cancelled = true;
    };
  }, [traceId]);

  // Reset state when trace changes
  useEffect(() => {
    if (traceId) {
      setSelectedSpanId(undefined);
      setActiveTab("details");
    }
  }, [traceId]);

  const handleSpanChange = useCallback(async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }

    const prevSpanId = currentSpanIdRef.current;
    currentSpanIdRef.current = span.id;
    setSelectedSpanId(span.id);
    // Auto-switch to Details tab unless user is on Graph or Timeline (where they may be cycling through spans)
    if (activeTabRef.current !== "graph" && activeTabRef.current !== "timeline") {
      setActiveTab("details");
    }

    if (span.id !== prevSpanId) {
      try {
        setScoresLoading(true);
        // Score `resource_id` is keyed differently by source:
        //   - CLI eval scores (postExperimentScores in run-experiment.ts)
        //     write resource_id = traceId so list/detail/avg views can
        //     JOIN on it.
        //   - Dashboard annotations write resource_id = spanId so they
        //     map to a specific UI node.
        // (See project memory `experiment-scores-keying`.)
        //
        // Fetch by span.id only — never by traceId here. The synthetic
        // root span the drawer renders at the top of the tree reuses
        // the trace id as its span id (selectedSpanData.id === trace.id
        // in the synthesised branch), so trace-keyed CLI evals naturally
        // appear when the user clicks the root. A previous version of
        // this code also queried by traceId for non-root spans and
        // merged the results, in the belief that "trace-level evals
        // apply to all spans"; the consequence was the same eval
        // duplicated onto every child span in the tree, making it look
        // like the leaf gen_ai/tool spans had been individually
        // evaluated. Trace evals belong on the trace; one query, one
        // place.
        const fetchedScores = await getScoresByResourceId(span.id);
        // Only apply if this span is still the current one (avoid stale overwrites)
        if (currentSpanIdRef.current === span.id) {
          setScores(fetchedScores);
        }
      } catch (err) {
        console.error("Error fetching scores:", err);
        if (currentSpanIdRef.current === span.id) {
          setScores([]);
        }
      } finally {
        if (currentSpanIdRef.current === span.id) {
          setScoresLoading(false);
        }
      }
    }
  }, []);

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

  // Dataset dialog state
  const [datasetDialogOpen, setDatasetDialogOpen] = useState(false);

  // Extract input/output from the selected span for dataset pre-filling
  const selectedSpanData = useMemo(() => {
    if (!selectedSpanId || !trace) return null;

    // When the trace-level wrapper node is selected, synthesize a span
    // from the root span's data (same merge the provider does)
    if (selectedSpanId === trace.id) {
      const rootSpans = findRootSpans(trace);
      const rootSpan = rootSpans.length === 1 ? rootSpans[0] : null;
      if (rootSpan) {
        return {
          id: trace.id,
          name: rootSpan.name || trace.name,
          data: { ...rootSpan.data },
        } as any;
      }
      return null;
    }

    return trace.spans.find((s: any) => s.id === selectedSpanId) || null;
  }, [selectedSpanId, trace]);

  const datasetInput = useMemo(() => extractSpanInput(selectedSpanData), [selectedSpanData]);
  const datasetExpectedOutput = useMemo(() => extractSpanExpectedOutput(selectedSpanData), [selectedSpanData]);
  const canAddToDataset = datasetInput != null || datasetExpectedOutput != null;
  const selectedPromptName = useMemo(
    () => extractSpanPromptName(selectedSpanData),
    [selectedSpanData]
  );
  // For "Test prompt" we want the *template variables* (frontmatter `props`)
  // — not `extractSpanInput`, which returns rendered chat messages for
  // GENERATION spans. The CLI command needs the same `props` you'd write
  // in `test_settings.props` to reproduce the run.
  const templateProps = useMemo(
    () => extractSpanTemplateProps(selectedSpanData),
    [selectedSpanData]
  );
  const canTestPrompt = !!selectedPromptName && !!templateProps;
  const [promptDialogOpen, setPromptDialogOpen] = useState(false);

  // The dialog only mounts when `selectedPromptName` is truthy (gate at the
  // bottom of this file). Without this effect, clicking the button on a
  // valid span and switching to a prompt-less span before the next render
  // would leave `promptDialogOpen=true` invisibly — then snap the dialog
  // open the next time the user picked a span with a prompt name. Force the
  // dialog closed any time the gate flips false.
  useEffect(() => {
    if (!selectedPromptName && promptDialogOpen) {
      setPromptDialogOpen(false);
    }
  }, [selectedPromptName, promptDialogOpen]);
  // Details tab content
  const renderDetailsTab = () => (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
      fetchSpanIO={getSpanIO}
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
                <Box sx={{ borderBottom: 1, borderColor: "divider", display: "flex", alignItems: "center" }}>
                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    aria-label="Trace view tabs"
                    sx={{ flex: 1 }}
                  >
                    <Tab label="Details" value="details" />
                    <Tab label="Graph" value="graph" />
                    <Tab label="Timeline" value="timeline" />
                  </Tabs>
                  <Tooltip
                    title={!canAddToDataset ? t("noDatasetProps") : ""}
                  >
                    <span style={{ flexShrink: 0, marginRight: 8 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setDatasetDialogOpen(true)}
                        disabled={!canAddToDataset}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {t("addToDataset")}
                      </Button>
                    </span>
                  </Tooltip>
                  <Tooltip
                    title={!canTestPrompt ? t("noPromptMetadata") : ""}
                  >
                    <span style={{ flexShrink: 0, marginRight: 16 }}>
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setPromptDialogOpen(true)}
                        disabled={!canTestPrompt}
                        sx={{ whiteSpace: "nowrap" }}
                      >
                        {t("testPrompt")}
                      </Button>
                    </span>
                  </Tooltip>
                </Box>

                {/* Tab content */}
                <Box sx={{ flex: 1, minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  {activeTab === "details" && renderDetailsTab()}
                  {activeTab === "graph" && renderGraphTab()}
                  {activeTab === "timeline" && renderTimelineTab()}
                </Box>
              </Box>
            </Box>
          </TraceDrawerContainer>
        )}
      </TraceDrawerComponent>
      <AddToDatasetDialog
        open={datasetDialogOpen}
        onClose={() => setDatasetDialogOpen(false)}
        initialInput={datasetInput}
        initialExpectedOutput={datasetExpectedOutput}
        t={t}
      />
      {selectedPromptName && (
        <TestPromptDialog
          open={promptDialogOpen}
          onClose={() => setPromptDialogOpen(false)}
          promptName={selectedPromptName}
          initialProps={templateProps}
          resolveFilePath={getPromptPathByName}
          t={t}
        />
      )}
    </TraceDrawerProvider>
  );
};
