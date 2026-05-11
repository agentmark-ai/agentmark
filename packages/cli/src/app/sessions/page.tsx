"use client";

import { Card, Stack, Typography } from "@mui/material";
import { SessionsList } from "@agentmark-ai/ui-components";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { SessionDrawer } from "./session-drawer";
import { getSessionsWithTotal } from "../../lib/api/sessions";
import type { SessionData } from "@agentmark-ai/ui-components";
import { useTable } from "@agentmark-ai/ui-components";

export default function SessionsPage() {
  const router = useRouter();
  const t = useTranslations("sessions");
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const table = useTable();

  useEffect(() => {
    // Guard against stale responses on remount/refetch — same pattern
    // applied across the audit. Mirrors trace-drawer.tsx.
    let cancelled = false;
    const fetchSessions = async () => {
      setIsLoading(true);
      const { sessions: fetchedSessions, total } = await getSessionsWithTotal();
      if (cancelled) return;
      // Map Session to SessionData format. The wire→Session translation
      // (snake_case → camelCase, ISO string → epoch ms) happens at the
      // boundary inside getSessionsWithTotal; here we just project the
      // fields the SessionsList component reads.
      const sessionData: SessionData[] = fetchedSessions.map((s) => ({
        id: s.id,
        name: s.name,
        start: s.start,
        end: s.end,
        traceCount: s.traceCount,
        totalCost: s.totalCost,
        totalTokens: s.totalTokens,
        latency: s.latency,
      }));
      setSessions(sessionData);
      setSessionTotal(total);
      setIsLoading(false);
    };
    fetchSessions();
    return () => {
      cancelled = true;
    };
  }, []);

  // Paginate sessions
  const paginatedSessions = useMemo(() => {
    const start = table.page * table.rowsPerPage;
    const end = start + table.rowsPerPage;
    return sessions.slice(start, end);
  }, [sessions, table.page, table.rowsPerPage]);

  const handleSessionClick = (session: SessionData) => {
    router.push(`/sessions?sessionId=${session.id}`);
  };

  const translationFunction = (key: string): string => {
    return t(key as keyof typeof t);
  };

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("title")}
      </Typography>
      <Card>
        <SessionsList
          sessions={paginatedSessions}
          isLoading={isLoading}
          sessionCount={sessionTotal || sessions.length}
          table={table}
          onSessionClick={handleSessionClick}
          t={translationFunction}
        />
      </Card>
      <Suspense fallback={<div>Loading...</div>}>
        <SessionDrawer />
      </Suspense>
    </Stack>
  );
}

