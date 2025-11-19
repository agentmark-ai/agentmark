"use client";

import {
  Card,
  TableBody,
  TableCell,
  TableRow,
  Typography,
  TableContainer,
  Stack,
  Table,
} from "@mui/material";
import {
  TableHeadCustom,
  TraceListItem,
  Trace,
  TracesList,
  useTable,
} from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { TraceDrawer } from "./trace-drawer";
import { getTraces } from "../../lib/api/traces";

export default function TracesPage() {
  const router = useRouter();
  const t = useTranslations("traces");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const table = useTable();

  useEffect(() => {
    const fetchTraces = async () => {
      setIsLoading(true);
      const fetchedTraces = await getTraces();
      setTraces(fetchedTraces);
      setIsLoading(false);
    };
    fetchTraces();
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">
        {t("title")}
      </Typography>
      <Card>
        <TracesList
          traces={traces}
          isLoading={isLoading}
          traceCount={traces.length}
          onTraceClick={(trace) => {
            router.push(`/traces?traceId=${trace.id}`);
          }}
          table={table}
          t={t}
        />
      </Card>

      <Suspense fallback={<div>Loading...</div>}>
        <TraceDrawer t={t} />
      </Suspense>
    </Stack>
  );
}
