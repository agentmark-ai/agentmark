/**
 * useChartOptions Hook
 *
 * Provides MUI-themed ApexCharts options for experiment charts.
 */

import { useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import type { ApexOptions } from "apexcharts";

export function useChartOptions(overrides?: ApexOptions): ApexOptions {
  const theme = useTheme();

  return useMemo(() => {
    const base: ApexOptions = {
      chart: {
        toolbar: { show: false },
        zoom: { enabled: false },
        fontFamily: theme.typography.fontFamily,
        foreColor: theme.palette.text.secondary,
      },
      colors: [theme.palette.primary.main],
      stroke: {
        curve: "smooth",
        width: 3,
      },
      markers: {
        size: 6,
        strokeWidth: 2,
        fillOpacity: 1,
        strokeOpacity: 1,
        strokeColors: theme.palette.background.paper,
      },
      grid: {
        borderColor: theme.palette.divider,
        strokeDashArray: 3,
      },
      xaxis: {
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: {
            colors: theme.palette.text.secondary,
            fontSize: "11px",
          },
          rotate: -45,
          rotateAlways: true,
        },
      },
      yaxis: {
        show: false,
      },
      tooltip: {
        theme: theme.palette.mode,
        x: { show: false },
      },
      legend: {
        position: "top",
        horizontalAlign: "right",
        labels: {
          colors: theme.palette.text.primary,
        },
      },
    };

    if (!overrides) return base;

    return {
      ...base,
      ...overrides,
      chart: { ...base.chart, ...overrides.chart },
      stroke: { ...base.stroke, ...overrides.stroke },
      markers: { ...base.markers, ...overrides.markers },
      xaxis: { ...base.xaxis, ...overrides.xaxis },
      tooltip: {
        ...base.tooltip,
        ...overrides.tooltip,
        y: overrides.tooltip?.y,
      },
    };
  }, [theme, overrides]);
}
