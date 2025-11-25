import {
  TraceDrawerProvider,
  TraceDrawerContainer,
  TraceDrawerHeader,
  TraceDrawerTitle,
  TraceDrawerSubtitle,
  TraceDrawerMain,
  TraceDrawerSidebar,
  TraceDrawerSidebarSectionResizer,
  TraceDrawerContent,
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
} from "@agentmark/ui-components";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useMemo } from "react";
import { getTraceById, getTraceGraph, GraphData } from "../../lib/api/traces";
import { getScoresByResourceId } from "../../lib/api/scores";

export const TraceDrawer = ({ t }: { t: (key: string) => string }) => {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);
  const [currentSpanId, setCurrentSpanId] = useState<string | null>(null);

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

  const handleSpanChange = async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }

    setCurrentSpanId(span.id);
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

  const traces = useMemo(() => {
    return trace ? [trace] : [];
  }, [trace]);

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
          router.push("/traces");
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
                height: "100%",
                overflow: "hidden",
              }}
            >
              <TraceDrawerMain>
                <TraceDrawerSidebar>
                  <TraceTree />
                  <TraceDrawerSidebarSectionResizer />
                  <TraceGraphCanvas
                    graphData={graphData}
                    isLoading={graphLoading}
                  />
                </TraceDrawerSidebar>
                <TraceDrawerContent>
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
                </TraceDrawerContent>
              </TraceDrawerMain>
            </Box>
          </TraceDrawerContainer>
        )}
      </TraceDrawerComponent>
    </TraceDrawerProvider>
  );
};
