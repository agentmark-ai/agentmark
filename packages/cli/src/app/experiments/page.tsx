"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  ExperimentsList,
  ExperimentCharts,
} from "@agentmark-ai/ui-components";
import type { ExperimentSummary } from "@agentmark-ai/ui-components";
import { getExperiments } from "../../lib/api/experiments";
import type { ExperimentSummary as CliExperimentSummary } from "../../lib/api/experiments";

function toSharedSummary(exp: CliExperimentSummary): ExperimentSummary {
  return {
    id: exp.id,
    name: exp.name,
    promptName: exp.promptName,
    datasetPath: exp.datasetPath,
    itemCount: exp.itemCount,
    avgLatencyMs: exp.avgLatencyMs,
    totalCost: exp.totalCost,
    avgScore: exp.avgScore,
    commitSha: exp.commitSha || undefined,
    createdAt: exp.createdAt || undefined,
  };
}

export default function ExperimentsPage() {
  const t = useTranslations("experiments");
  const router = useRouter();
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExperiments = async () => {
      setIsLoading(true);
      const data = await getExperiments();
      setExperiments(data.map(toSharedSummary));
      setIsLoading(false);
    };
    fetchExperiments();
  }, []);

  const translate = useCallback((key: string) => t(key), [t]);

  return (
    <ExperimentsList
      experiments={experiments}
      total={experiments.length}
      isLoading={isLoading}
      onExperimentClick={(id) =>
        router.push(`/experiments/${encodeURIComponent(id)}`)
      }
      onCompare={(ids) =>
        router.push(`/experiments/compare?ids=${ids.join(",")}`)
      }
      t={translate}
      showDatasetColumn
      showCreatedColumn
      chartsSlot={
        experiments.length >= 2 ? (
          <ExperimentCharts experiments={experiments} t={translate} />
        ) : undefined
      }
    />
  );
}
