"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@mui/material";
import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { Iconify } from "@/components";
import {
  ExperimentDetailView,
  ExperimentCharts,
} from "@agentmark-ai/ui-components";
import type { ExperimentDetail } from "@agentmark-ai/ui-components";
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
      tokens: 0,
      model: "",
      scores: item.scores,
    })),
  };
}

export default function ExperimentDetailPage() {
  const t = useTranslations("experiments");
  const td = useTranslations("experiments.detail");
  const router = useRouter();
  const params = useParams();
  const experimentId = params.id as string;

  const [experiment, setExperiment] = useState<ExperimentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExperiment = async () => {
      setIsLoading(true);
      const data = await getExperimentById(experimentId);
      setExperiment(data ? toSharedDetail(data) : null);
      setIsLoading(false);
    };
    fetchExperiment();
  }, [experimentId]);

  const translate = useCallback(
    (key: string) => {
      // Shared components use flat keys. Try experiments namespace first
      // (items, avgScore, etc.), then detail namespace (input, output, etc.)
      // next-intl returns the key path on miss, so check for that.
      const expResult = t(key);
      if (!expResult.includes(".")) return expResult;
      const detailResult = td(key);
      if (!detailResult.includes(".")) return detailResult;
      return key;
    },
    [t, td]
  );

  return (
    <ExperimentDetailView
      experiment={experiment}
      isLoading={isLoading}
      t={translate}
      onTraceClick={(traceId) => router.push(`/traces?traceId=${traceId}`)}
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
      chartsSlot={
        experiment ? (
          <ExperimentCharts experiments={[experiment]} t={(key: string) => t(key)} />
        ) : undefined
      }
    />
  );
}
