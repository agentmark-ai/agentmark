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
} from "@agentmark/ui-components";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTraceById, getTraceGraph, GraphData } from "../../lib/api/traces";
import { getScoresByResourceId } from "../../lib/api/scores";

export const TraceDrawer = ({ t }: { t: (key: string) => string }) => {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<GraphData[]>([]);
  const [graphLoading, setGraphLoading] = useState(false);

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

  return (
    <TraceDrawerProvider
      traces={trace ? [trace] : []}
      traceId={traceId || undefined}
      t={t}
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
                  <TraceGraphCanvas graphData={graphData} isLoading={graphLoading} />
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
                          fetchEvaluations={async (spanId) => {
                            return await getScoresByResourceId(spanId);
                          }}
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
