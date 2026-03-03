"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
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
  Typography,
} from "@mui/material";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { Iconify } from "@/components";
import {
  getExperimentById,
  type ExperimentDetail,
} from "../../../lib/api/experiments";

function CompareContent() {
  const t = useTranslations("experiments");
  const tc = useTranslations("experiments.compare");
  const router = useRouter();
  const searchParams = useSearchParams();

  const experimentIds = useMemo(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) return [];
    return idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }, [searchParams]);

  const isValidIdCount = experimentIds.length >= 2 && experimentIds.length <= 3;

  const [experiments, setExperiments] = useState<ExperimentDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isValidIdCount) {
      setIsLoading(false);
      return;
    }
    const fetchAll = async () => {
      setIsLoading(true);
      const results = await Promise.all(
        experimentIds.map((id) => getExperimentById(id))
      );
      setExperiments(
        results.filter((r): r is ExperimentDetail => r !== null)
      );
      setIsLoading(false);
    };
    fetchAll();
  }, [experimentIds, isValidIdCount]);

  // Build comparison data: map item names to experiment data
  const { allItemNames, experimentData, summary } = useMemo(() => {
    const itemMap = new Map<
      string,
      Map<string, { output: string; score: number | null; latencyMs: number; cost: number }>
    >();

    for (const exp of experiments) {
      for (const item of exp.items) {
        if (!itemMap.has(item.itemName)) {
          itemMap.set(item.itemName, new Map());
        }
        const avgScore =
          item.scores.length > 0
            ? item.scores.reduce((sum, s) => sum + s.score, 0) / item.scores.length
            : null;
        itemMap.get(item.itemName)!.set(exp.summary.id, {
          output: item.actualOutput,
          score: avgScore,
          latencyMs: item.latencyMs,
          cost: item.cost,
        });
      }
    }

    const allNames = Array.from(itemMap.keys()).sort();

    // Compute summary stats
    let overlapping = 0;
    let improved = 0;
    let regressed = 0;
    let unchanged = 0;
    let unscored = 0;

    if (experiments.length >= 2) {
      for (const name of allNames) {
        const expData = itemMap.get(name)!;
        const presentInAll = experiments.every((e) => expData.has(e.summary.id));
        if (presentInAll) {
          overlapping++;
          const scores = experiments.map((e) => expData.get(e.summary.id)!.score);
          if (scores.some((s) => s === null)) {
            unscored++;
          } else {
            const first = scores[0]!;
            const last = scores[scores.length - 1]!;
            if (last > first) improved++;
            else if (last < first) regressed++;
            else unchanged++;
          }
        }
      }
    }

    return {
      allItemNames: allNames,
      experimentData: itemMap,
      summary: {
        totalItems: allNames.length,
        overlapping,
        improved,
        regressed,
        unchanged,
        unscored,
      },
    };
  }, [experiments]);

  if (!isValidIdCount) {
    return (
      <Stack spacing={2} sx={{ p: 2 }} alignItems="center">
        <Typography variant="body1" color="warning.main">
          {tc("invalidIds")}
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

  if (isLoading) {
    return (
      <Stack spacing={2} sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          {t("loading")}
        </Typography>
      </Stack>
    );
  }

  if (experiments.length < 2) {
    return (
      <Stack spacing={2} sx={{ p: 2 }} alignItems="center">
        <Typography variant="body1" color="error">
          {tc("error")}
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

      <Typography variant="h5">{tc("title")}</Typography>

      {/* Summary banner */}
      <Card sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("totalItems")}
            </Typography>
            <Typography variant="h6">{summary.totalItems}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("overlapping")}
            </Typography>
            <Typography variant="h6">{summary.overlapping}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("improved")}
            </Typography>
            <Chip
              label={summary.improved}
              size="small"
              sx={{ color: "success.main", bgcolor: "success.lighter", fontWeight: "bold" }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("regressed")}
            </Typography>
            <Chip
              label={summary.regressed}
              size="small"
              sx={{ color: "error.main", bgcolor: "error.lighter", fontWeight: "bold" }}
            />
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("unchanged")}
            </Typography>
            <Typography variant="h6">{summary.unchanged}</Typography>
          </Grid>
          <Grid size={{ xs: 6, sm: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {tc("unscored")}
            </Typography>
            <Typography variant="h6" color="text.disabled">
              {summary.unscored}
            </Typography>
          </Grid>
        </Grid>
      </Card>

      {/* Comparison table */}
      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell rowSpan={2} sx={{ minWidth: 120 }}>
                  {tc("itemName")}
                </TableCell>
                {experiments.map((exp) => (
                  <TableCell
                    key={exp.summary.id}
                    colSpan={4}
                    align="center"
                    sx={{ borderBottom: 1, borderBottomColor: "divider", bgcolor: "background.default" }}
                  >
                    <Typography variant="subtitle2" noWrap>
                      {exp.summary.name}
                    </Typography>
                  </TableCell>
                ))}
              </TableRow>
              <TableRow>
                {experiments.map((exp) => (
                  <SubHeaders key={exp.summary.id} tc={tc} />
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {allItemNames.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={1 + experiments.length * 4}
                    align="center"
                    sx={{ py: 4 }}
                  >
                    <Typography variant="body2" color="text.disabled">
                      {tc("noItems")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {allItemNames.map((itemName) => {
                const expData = experimentData.get(itemName)!;
                return (
                  <TableRow key={itemName} hover>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 120 }}>
                        {itemName}
                      </Typography>
                    </TableCell>
                    {experiments.map((exp) => {
                      const data = expData.get(exp.summary.id);
                      if (!data) {
                        return (
                          <EmptyCells key={exp.summary.id} />
                        );
                      }
                      return (
                        <DataCells key={exp.summary.id} data={data} />
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
    </Stack>
  );
}

function SubHeaders({ tc }: { tc: (key: string) => string }) {
  return (
    <>
      <TableCell>{tc("output")}</TableCell>
      <TableCell>{tc("score")}</TableCell>
      <TableCell>{tc("latency")}</TableCell>
      <TableCell>{tc("cost")}</TableCell>
    </>
  );
}

function EmptyCells() {
  return (
    <>
      <TableCell><Typography variant="body2" color="text.disabled">–</Typography></TableCell>
      <TableCell><Typography variant="body2" color="text.disabled">–</Typography></TableCell>
      <TableCell><Typography variant="body2" color="text.disabled">–</Typography></TableCell>
      <TableCell><Typography variant="body2" color="text.disabled">–</Typography></TableCell>
    </>
  );
}

function DataCells({
  data,
}: {
  data: { output: string; score: number | null; latencyMs: number; cost: number };
}) {
  const truncatedOutput =
    data.output.length > 80 ? `${data.output.slice(0, 80)}...` : data.output;
  return (
    <>
      <TableCell>
        <Typography
          variant="caption"
          sx={{ maxWidth: 200, display: "block", whiteSpace: "pre-wrap", wordBreak: "break-word" }}
        >
          {truncatedOutput || "–"}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">
          {data.score != null ? data.score.toFixed(2) : "–"}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">
          {data.latencyMs >= 1000
            ? `${(data.latencyMs / 1000).toFixed(1)}s`
            : `${data.latencyMs}ms`}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">${data.cost.toFixed(5)}</Typography>
      </TableCell>
    </>
  );
}

export default function ExperimentComparePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}
