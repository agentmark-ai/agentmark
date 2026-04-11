"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Button } from "@mui/material";
import { Stack } from "@mui/system";
import { useTranslations } from "next-intl";
import { useSearchParams, useRouter } from "next/navigation";
import { Iconify } from "@/components";
import {
  ExperimentComparison,
  buildComparisonRows,
  computeComparisonSummary,
} from "@agentmark-ai/ui-components";
import type { ExperimentDetail, ComparisonRow } from "@agentmark-ai/ui-components";
import {
  getExperimentById,
  type ExperimentDetail as CliExperimentDetail,
} from "../../../lib/api/experiments";

function toSharedDetail(cli: CliExperimentDetail): ExperimentDetail {
  return {
    id: cli.summary.id,
    name: cli.summary.name,
    promptName: cli.summary.promptName,
    datasetPath: cli.summary.datasetPath,
    itemCount: cli.summary.itemCount,
    avgLatencyMs: cli.summary.avgLatencyMs,
    totalCost: cli.summary.totalCost,
    avgScore: cli.summary.avgScore,
    commitSha: cli.summary.commitSha || undefined,
    createdAt: cli.summary.createdAt || undefined,
    items: cli.items.map((item) => ({
      traceId: item.traceId,
      itemName: item.itemName,
      input: item.input,
      expectedOutput: item.expectedOutput,
      output: item.actualOutput,
      latencyMs: item.latencyMs,
      cost: item.cost,
      tokens: item.totalTokens,
      model: item.model,
      scores: item.scores,
    })),
  };
}

function CompareContent() {
  const t = useTranslations("experiments");
  const tc = useTranslations("experiments.compare");
  const router = useRouter();
  const searchParams = useSearchParams();

  const experimentIds = useMemo(() => {
    const idsParam = searchParams.get("ids");
    if (!idsParam) return [];
    return idsParam.split(",").map((id) => id.trim()).filter(Boolean);
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
        results.filter((r): r is CliExperimentDetail => r !== null).map(toSharedDetail)
      );
      setIsLoading(false);
    };
    fetchAll();
  }, [experimentIds, isValidIdCount]);

  const { rows, summary } = useMemo(() => {
    if (experiments.length < 2) return { rows: [] as ComparisonRow[], summary: null };
    const r = buildComparisonRows(experiments);
    const ids = experiments.map((e) => e.id);
    const s = computeComparisonSummary(r, ids);
    return { rows: r, summary: s };
  }, [experiments]);

  const experimentNames: Record<string, string> = {};
  const experimentCommitShas: Record<string, string | undefined> = {};
  for (const exp of experiments) {
    experimentNames[exp.id] = exp.name;
    experimentCommitShas[exp.id] = exp.commitSha;
  }

  const translate = useCallback(
    (key: string) => {
      // Try compare namespace first, then experiments namespace.
      // next-intl returns key path on miss (not throw), so check for dots.
      const compareResult = tc(key);
      if (!compareResult.includes(".")) return compareResult;
      const expResult = t(key);
      if (!expResult.includes(".")) return expResult;
      return key;
    },
    [t, tc]
  );

  if (!isValidIdCount) {
    return (
      <Stack spacing={2} sx={{ p: 2 }} alignItems="center">
        <Alert severity="warning">{tc("invalidIds")}</Alert>
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
    <ExperimentComparison
      rows={rows}
      experimentNames={experimentNames}
      experimentIds={experimentIds}
      experimentCommitShas={experimentCommitShas}
      summary={summary}
      isLoading={isLoading}
      t={translate}
      headerSlot={
        <Button
          startIcon={<Iconify icon="eva:arrow-back-fill" />}
          onClick={() => router.push("/experiments")}
          sx={{ alignSelf: "flex-start" }}
          color="inherit"
        >
          {t("backToList")}
        </Button>
      }
    />
  );
}

export default function ExperimentComparePage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <CompareContent />
    </Suspense>
  );
}
