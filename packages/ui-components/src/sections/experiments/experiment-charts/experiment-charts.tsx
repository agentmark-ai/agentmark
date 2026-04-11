/**
 * ExperimentCharts Component
 *
 * Renders comparison line charts for experiment metrics:
 * latency, cost, and eval scores across experiments.
 *
 * Uses React.lazy for SSR-safe dynamic import of react-apexcharts
 * (this is a library package built with tsup, not a Next.js app).
 */

import { Component, lazy, Suspense, useMemo } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import { Card, CardContent, CardHeader, Grid } from "@mui/material";
import { fCurrency } from "@/utils";
import type { ExperimentSummary } from "../types";
import { useChartOptions } from "./use-chart-options";

// Minimal error boundary — degrades to null when the chart library crashes
// (e.g. react-apexcharts CJS/ESM interop issues in certain environments).
class ChartErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(_: Error, info: ErrorInfo) {
    console.warn("Chart render failed, hiding charts:", info.componentStack);
  }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ApexChart = lazy(() => import("react-apexcharts") as any);

// ----------------------------------------------------------------------

export interface ExperimentChartsProps {
  experiments: ExperimentSummary[];
  t: (key: string) => string;
}

const formatLatency = (latencyMs: number): string => {
  if (latencyMs >= 1000) return `${(latencyMs / 1000).toFixed(1)}s`;
  return `${latencyMs.toFixed(0)}ms`;
};

// ----------------------------------------------------------------------

export const ExperimentCharts = ({
  experiments,
  t,
}: ExperimentChartsProps) => {
  const theme = useTheme();

  const categories = useMemo(
    () => experiments.map((exp) => exp.name),
    [experiments]
  );

  const latencyOptions = useChartOptions({
    tooltip: { y: { formatter: (value: number) => formatLatency(value) } },
    xaxis: { categories },
  });

  const latencySeries = useMemo(
    () => [{ name: t("avgLatency"), data: experiments.map((exp) => exp.avgLatencyMs) }],
    [experiments, t]
  );

  const costOptions = useChartOptions({
    tooltip: { y: { formatter: (value: number) => fCurrency(value, 5) } },
    xaxis: { categories },
  });

  const costSeries = useMemo(
    () => [{ name: t("totalCost"), data: experiments.map((exp) => exp.totalCost) }],
    [experiments, t]
  );

  const hasScores = experiments.some((exp) => exp.avgScore != null);

  const scoreOptions = useChartOptions({
    tooltip: {
      y: {
        formatter: (value: number) => {
          if (value === 0) return "0";
          if (value >= 1) return value.toFixed(1);
          return value.toFixed(3).replace(/\.?0+$/, "");
        },
      },
    },
    xaxis: { categories },
    legend: { position: "bottom" },
  });

  const scoreSeries = useMemo(
    () => [
      {
        name: t("avgScore"),
        data: experiments.map((exp) => exp.avgScore ?? 0),
        color: theme.palette.primary.main,
      },
    ],
    [experiments, theme, t]
  );

  if (experiments.length === 0) return null;

  return (
    <ChartErrorBoundary>
    <Suspense fallback={null}>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardHeader title={t("avgLatency")} slotProps={{ title: { variant: "subtitle2" } }} />
            <CardContent sx={{ pt: 0 }}>
              <ApexChart
                height={180}
                options={{ ...latencyOptions, xaxis: { ...latencyOptions.xaxis, type: "category" } }}
                series={latencySeries}
                type="line"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Card sx={{ height: "100%" }}>
            <CardHeader title={t("totalCost")} slotProps={{ title: { variant: "subtitle2" } }} />
            <CardContent sx={{ pt: 0 }}>
              <ApexChart
                height={180}
                options={{ ...costOptions, xaxis: { ...costOptions.xaxis, type: "category" } }}
                series={costSeries}
                type="line"
              />
            </CardContent>
          </Card>
        </Grid>

        {hasScores && (
          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: "100%" }}>
              <CardHeader title={t("avgScore")} slotProps={{ title: { variant: "subtitle2" } }} />
              <CardContent sx={{ pt: 0 }}>
                <ApexChart
                  height={180}
                  options={{ ...scoreOptions, xaxis: { ...scoreOptions.xaxis, type: "category" } }}
                  series={scoreSeries}
                  type="line"
                />
              </CardContent>
            </Card>
          </Grid>
        )}
      </Grid>
    </Suspense>
    </ChartErrorBoundary>
  );
};
