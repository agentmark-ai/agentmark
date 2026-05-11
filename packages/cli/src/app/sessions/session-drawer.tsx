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
} from "@agentmark-ai/ui-components";
import { Box, Stack, Typography } from "@mui/material";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
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
  const currentSpanIdRef = useRef<string | null>(null);

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

    // Guard against stale responses: when the user clicks session A then
    // quickly clicks session B, A's pending fetch can resolve AFTER B's
    // and overwrite B's traces[] under B's title. Mirrors the cancelled
    // flag pattern in trace-drawer.tsx.
    let cancelled = false;
    const fetchTraces = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedTraces = await getTracesBySessionId(sessionId);
        if (cancelled) return;
        if (fetchedTraces.length === 0) {
          setError("No traces found for this session");
          setTraces([]);
        } else {
          setTraces(fetchedTraces);
        }
      } catch {
        if (cancelled) return;
        setError("Failed to load session traces");
        setTraces([]);
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };
    fetchTraces();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const handleSpanChange = useCallback(async (span: SpanData | null) => {
    if (!span?.id) {
      currentSpanIdRef.current = null;
      setScores([]);
      return;
    }

    // Guard against stale responses: when the user toggles between spans
    // quickly the previous getScoresByResourceId can resolve AFTER the
    // new one and overwrite the fresh scores list. Mirror the
    // currentSpanIdRef pattern from trace-drawer.tsx.
    currentSpanIdRef.current = span.id;
    setScoresLoading(true);
    try {
      // Score `resource_id` is keyed differently by source: CLI eval
      // scores write resource_id = traceId, dashboard annotations write
      // resource_id = spanId. Fetch both (when distinct) and merge so
      // CLI-written eval scores surface here too. See trace-drawer.tsx
      // for the canonical implementation of this pattern.
      const traceIdForSpan = span.traceId;
      const queries: Array<Promise<ScoreData[]>> = [getScoresByResourceId(span.id)];
      if (traceIdForSpan && traceIdForSpan !== span.id) {
        queries.push(getScoresByResourceId(traceIdForSpan));
      }
      const results = await Promise.all(queries);
      const seen = new Set<string>();
      const merged: ScoreData[] = [];
      for (const list of results) {
        for (const s of list) {
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          merged.push(s);
        }
      }
      if (currentSpanIdRef.current === span.id) {
        setScores(merged);
      }
    } catch (error) {
      console.error("Error fetching scores:", error);
      if (currentSpanIdRef.current === span.id) {
        setScores([]);
      }
    } finally {
      if (currentSpanIdRef.current === span.id) {
        setScoresLoading(false);
      }
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
