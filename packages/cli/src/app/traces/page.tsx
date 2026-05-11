"use client";

import { Card, Typography, Stack } from "@mui/material";
import { Trace, TracesList, useTable } from "@agentmark-ai/ui-components";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TraceDrawer } from "./trace-drawer";
import { getTraces } from "../../lib/api/traces";

function TracesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get("runId");
  const t = useTranslations("traces");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [traceCount, setTraceCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const table = useTable();

  useEffect(() => {
    // Guard against stale responses: when the user paginates quickly
    // (page 0 → 1 → 2) or changes the runId filter mid-load, the
    // previous fetch can resolve AFTER the latest one and overwrite the
    // visible page with stale rows + a stale total. Mirrors the
    // cancelled-flag pattern in trace-drawer.tsx.
    let cancelled = false;
    const fetchTraces = async () => {
      setIsLoading(true);
      const { traces: fetched, total } = await getTraces({
        runId: runId || undefined,
        limit: table.rowsPerPage,
        offset: table.page * table.rowsPerPage,
      });
      if (cancelled) return;
      setTraces(fetched);
      setTraceCount(total);
      setIsLoading(false);
    };
    fetchTraces();
    return () => {
      cancelled = true;
    };
  }, [runId, table.page, table.rowsPerPage]);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("title")}
      </Typography>
      <Card>
        <TracesList
          traces={traces}
          isLoading={isLoading}
          traceCount={traceCount}
          onTraceClick={(trace) => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("traceId", trace.id);
            router.push(`/traces?${params.toString()}`);
          }}
          table={table}
          t={t}
        />
      </Card>

      <TraceDrawer t={t} />
    </Stack>
  );
}

export default function TracesPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TracesContent />
    </Suspense>
  );
}
