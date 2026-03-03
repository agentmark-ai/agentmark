"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Iconify } from "@/components";
import {
  getExperimentById,
  type ExperimentDetail,
} from "../../../lib/api/experiments";

export default function ExperimentDetailPage() {
  const t = useTranslations("experiments");
  const td = useTranslations("experiments.detail");
  const router = useRouter();
  const params = useParams();
  const experimentId = params.id as string;

  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchExperiment = async () => {
      setIsLoading(true);
      setError(null);
      const data = await getExperimentById(experimentId);
      if (!data) {
        setError(t("notFound"));
      } else {
        setExperiment(data);
      }
      setIsLoading(false);
    };
    fetchExperiment();
  }, [experimentId, t]);

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  const formatCost = (cost: number) => `$${cost.toFixed(5)}`;

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t("loading")}
        </Typography>
      </Stack>
    );
  }

  if (error || !experiment) {
    return (
      <Stack spacing={2} sx={{ p: 2 }} alignItems="center">
        <Typography variant="h6" color="error">
          {error || t("notFound")}
        </Typography>
        <Button
          startIcon={<Iconify icon="eva:arrow-back-fill" />}
          onClick={() => router.push("/experiments")}
        >
          {t("backToList")}
        </Button>
      </Stack>
    );
  }

  const { summary, items } = experiment;

  return (
    <Stack spacing={3}>
      <Button
        startIcon={<Iconify icon="eva:arrow-back-fill" />}
        onClick={() => router.push("/experiments")}
        sx={{ alignSelf: "flex-start" }}
        color="inherit"
      >
        {t("backToList")}
      </Button>

      <Typography variant="h5">{summary.name}</Typography>

      {/* Summary card */}
      <Card sx={{ p: 3 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>
          {td("summary")}
        </Typography>
        <Grid container spacing={3}>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t("items")}
            </Typography>
            <Typography variant="h6">{summary.itemCount}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t("avgLatency")}
            </Typography>
            <Typography variant="h6">
              {formatLatency(summary.avgLatencyMs)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t("totalCost")}
            </Typography>
            <Typography variant="h6">{formatCost(summary.totalCost)}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 3 }}>
            <Typography variant="caption" color="text.secondary">
              {t("avgScore")}
            </Typography>
            <Typography variant="h6">
              {summary.avgScore != null ? summary.avgScore.toFixed(2) : "--"}
            </Typography>
          </Grid>
          {summary.promptName && (
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">
                {t("promptName")}
              </Typography>
              <Typography variant="body1">{summary.promptName}</Typography>
            </Grid>
          )}
          {summary.datasetPath && (
            <Grid size={{ xs: 6, sm: 3 }}>
              <Typography variant="caption" color="text.secondary">
                {t("datasetPath")}
              </Typography>
              <Typography variant="body1">{summary.datasetPath}</Typography>
            </Grid>
          )}
        </Grid>
      </Card>

      {/* Items table */}
      <Card>
        <Stack sx={{ p: 2 }}>
          <Typography variant="subtitle2">{td("itemsTable")}</Typography>
        </Stack>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{td("itemName")}</TableCell>
                <TableCell>{td("input")}</TableCell>
                <TableCell>{td("expectedOutput")}</TableCell>
                <TableCell>{td("actualOutput")}</TableCell>
                <TableCell>{td("latency")}</TableCell>
                <TableCell>{td("cost")}</TableCell>
                <TableCell>{td("scores")}</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {td("noItems")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {items.map((item) => (
                <TableRow key={item.traceId} hover>
                  <TableCell>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                      {item.itemName}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{
                        maxWidth: 200,
                        maxHeight: 80,
                        overflow: "auto",
                        display: "block",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.input ? truncate(item.input, 120) : "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{
                        maxWidth: 200,
                        maxHeight: 80,
                        overflow: "auto",
                        display: "block",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.expectedOutput
                        ? truncate(item.expectedOutput, 120)
                        : "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography
                      variant="caption"
                      sx={{
                        maxWidth: 200,
                        maxHeight: 80,
                        overflow: "auto",
                        display: "block",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.actualOutput
                        ? truncate(item.actualOutput, 120)
                        : "-"}
                    </Typography>
                  </TableCell>
                  <TableCell>{formatLatency(item.latencyMs)}</TableCell>
                  <TableCell>{formatCost(item.cost)}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap">
                      {item.scores.length > 0
                        ? item.scores.map((s) => (
                            <Tooltip
                              key={s.name}
                              title={`${s.label}${s.reason ? ` — ${s.reason}` : ""}`}
                            >
                              <Chip
                                label={`${s.name}: ${s.score.toFixed(2)}`}
                                size="small"
                                variant="outlined"
                                color={s.score >= 0.5 ? "success" : "error"}
                              />
                            </Tooltip>
                          ))
                        : "--"}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() =>
                        router.push(`/traces?traceId=${item.traceId}`)
                      }
                    >
                      {td("viewTrace")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}
