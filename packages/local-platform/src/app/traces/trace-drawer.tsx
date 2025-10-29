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
  SpanData,
  TraceInfoSkeleton,
} from "@agentmark/ui-components";
import { Box, Stack } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const getSpan = async (traceId: string): Promise<SpanData> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        id: "1",
        name: "Span 1",
        duration: 1000,
        timestamp: 1000,
        data: {
          model_name: "Model 1",
          attributes: "Attributes 1",
          status_message: "Status Message 1",
        },
      });
    }, 1000);
  });
};

export const TraceDrawer = ({ t }: { t: (key: string) => string }) => {
  const [loading, setLoading] = useState(true);
  const [span, setSpan] = useState<SpanData | null>(null);

  const searchParams = useSearchParams();
  const traceId = searchParams.get("traceId");
  const router = useRouter();

  useEffect(() => {
    getSpan(traceId ?? "").then((span) => {
      setSpan(span);
      setLoading(false);
    });
  }, [traceId]);

  console.log(span);

  return (
    <TraceDrawerProvider traces={[]} traceId="1" sessionId="1" t={t}>
      <TraceDrawerComponent
        open={!!traceId}
        onClose={() => {
          router.push("/traces");
        }}
      >
        {loading && <TraceInfoSkeleton />}
        {!loading && (
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
                  <TraceGraphCanvas graphData={[]} isLoading={false} />
                </TraceDrawerSidebar>
                <TraceDrawerContent>
                  <SpanInfoProvider>
                    <SpanInfoHeader />
                    <SpanInfoContent>
                      <SpanInfoTabs>
                        <AttributesTab />
                        <InputOutputTab />
                        <EvaluationProvider
                          canAddAnnotation={true}
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
                              <Stack direction="row" justifyContent="flex-end">
                                <AddAnnotations />
                                <AddAnnotationDialog
                                  saveAnnotation={() =>
                                    Promise.resolve({ hasError: false })
                                  }
                                />
                              </Stack>
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
