"use client";

import { Card, Stack, Typography } from "@mui/material";
import { SessionsList } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useMemo, Suspense } from "react";
import { SessionDrawer } from "./session-drawer";
import { getSessions } from "../../lib/api/sessions";
import type { SessionData } from "@agentmark/ui-components";
import { useTable } from "@agentmark/ui-components";

export default function SessionsPage() {
  const router = useRouter();
  const t = useTranslations("sessions");
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const table = useTable();

  useEffect(() => {
    const fetchSessions = async () => {
      setIsLoading(true);
      const fetchedSessions = await getSessions();
      // Map Session to SessionData format
      const sessionData: SessionData[] = fetchedSessions.map((s) => ({
        id: s.id,
        name: s.name,
        start: s.start,
        end: s.end,
      }));
      setSessions(sessionData);
      setIsLoading(false);
    };
    fetchSessions();
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
          sessionCount={sessions.length}
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

