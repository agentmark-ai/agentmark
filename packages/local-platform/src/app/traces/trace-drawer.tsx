import {
  TraceDrawerProvider,
  TraceDrawerContainer,
  TraceDrawerHeader,
  TraceDrawerTitle,
  TraceDrawerAddToDatasetButton,
  TraceDrawerTestPromptButton,
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
  AddAnnotations,
  AddAnnotationDialog,
  EvaluationList,
  TraceDrawer as TraceDrawerComponent,
  TraceData,
  TraceInfoSkeleton,
} from "@agentmark/ui-components";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { getTraceById } from "../../lib/api/traces";

export const TraceDrawer = ({ t }: { t: (key: string) => string }) => {
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const traceId = searchParams.get("traceId");
  const router = useRouter();

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      setLoading(false);
      setError(null);
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
                <Stack direction="row" spacing={2}>
                  <TraceDrawerAddToDatasetButton>
                    {t("addToDataset")}
                  </TraceDrawerAddToDatasetButton>
                  <TraceDrawerTestPromptButton>
                    {t("testPrompt")}
                  </TraceDrawerTestPromptButton>
                </Stack>
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
                  <TraceGraphCanvas graphData={[]} isLoading={false} />{" "}
                  {/* Graph data API to be implemented later */}
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
                          fetchEvaluations={(spanId) => {
                            return new Promise((resolve) => {
                              setTimeout(() => {
                                resolve([
                                  {
                                    id: "1",
                                    name: "Evaluation 1",
                                    score: 0.9,
                                    label: "Positive",
                                    reason: "Reason 1",
                                  },
                                ]);
                              }, 1000);
                            });
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
