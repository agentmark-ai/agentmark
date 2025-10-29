"use client";

import {
  Card,
  TableBody,
  Typography,
  TableContainer,
  Stack,
  Table,
} from "@mui/material";
import { TableHeadCustom, TraceListItem } from "@agentmark/ui-components";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { TraceDrawer } from "./trace-drawer";

export default function TracesPage() {
  const router = useRouter();
  const t = useTranslations("traces");

  const traces = [
    {
      id: "1",
      name: "Trace 1",
      status: "success",
      latency: "100",
      cost: "100",
      tokens: "100",
      start: new Date().toISOString(),
      end: new Date().toISOString(),
    },
  ];

  return (
    <Stack>
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
              {traces.map((trace) => (
                <TraceListItem
                  key={trace.id}
                  trace={trace}
                  onClick={(trace) => {
                    router.push(`/traces?traceId=${trace.id}`);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      <TraceDrawer t={t} />
    </Stack>
  );
}
