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
} from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TraceDrawer } from "./trace-drawer";
import { getTraces } from "../../lib/api/traces";

export default function TracesPage() {
  const router = useRouter();
  const t = useTranslations("traces");
  const [traces, setTraces] = useState<Trace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
        <TableContainer>
          <Table>
            <TableHeadCustom
              headLabel={[
                { id: "name", label: t("name") },
                { id: "status", label: t("status") },
                { id: "latency", label: t("latency") },
                { id: "cost", label: t("cost") },
                { id: "tokens", label: t("tokens") },
                { id: "timestamp", label: t("timestamp") },
              ]}
            />
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography sx={{ p: 2, color: "text.secondary" }}>
                      {t("loading")}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : traces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    <Typography sx={{ p: 2, color: "text.secondary" }}>
                      {t("noTraces")}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                traces.map((trace) => (
                  <TraceListItem
                    key={trace.id}
                    trace={trace}
                    onClick={(trace) => {
                      router.push(`/traces?traceId=${trace.id}`);
                    }}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <TraceDrawer t={t} />
    </Stack>
  );
}
