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
import { useEffect, useState, useCallback } from "react";
import { getTracesBySessionId } from "../../lib/api/sessions";
import { getScoresByResourceId } from "../../lib/api/scores";
import { useTranslations } from "next-intl";

export const SessionDrawer = () => {
  const t = useTranslations("traces");
  const [loading, setLoading] = useState(false);
  const [traces, setTraces] = useState<TraceData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [scoresLoading, setScoresLoading] = useState(false);

  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  const router = useRouter();

  useEffect(() => {
    if (!sessionId) {
      setTraces([]);
      setLoading(false);
      setError(null);
      return;
    }

    const fetchTraces = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedTraces = await getTracesBySessionId(sessionId);
        if (fetchedTraces.length === 0) {
          setError("No traces found for this session");
          setTraces([]);
        } else {
          setTraces(fetchedTraces);
        }
      } catch {
        setError("Failed to load session traces");
        setTraces([]);
      } finally {
        setLoading(false);
      }
    };
    fetchTraces();
  }, [sessionId]);

  const handleSpanChange = useCallback(async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }

    setScoresLoading(true);
    try {
      const fetchedScores = await getScoresByResourceId(span.id);
      setScores(fetchedScores);
    } catch (error) {
      console.error("Error fetching scores:", error);
      setScores([]);
    } finally {
      setScoresLoading(false);
    }
  }, []);


  return (
    <TraceDrawerProvider
      traces={traces}
      sessionId={sessionId || undefined}
      t={t}
      onSpanChange={handleSpanChange}
    >
      <TraceDrawerComponent
        open={!!sessionId}
        onClose={() => {
          router.push("/sessions");
        }}
      >
        {loading && <TraceInfoSkeleton />}
        {error && (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <Typography color="error">{error}</Typography>
          </Box>
        )}
        {!loading && !error && traces.length > 0 && (
          <TraceDrawerContainer>
            <TraceDrawerHeader>
              <Stack direction="row" justifyContent="space-between">
                <TraceDrawerTitle>{t("sessionDetails")}</TraceDrawerTitle>
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
