"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Checkbox,
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
import { useRouter } from "next/navigation";
import { Iconify } from "@/components";
import {
  getExperiments,
  type ExperimentSummary,
} from "../../lib/api/experiments";

export default function ExperimentsPage() {
  const t = useTranslations("experiments");
  const router = useRouter();
  const [experiments, setExperiments] = useState<ExperimentSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const fetchExperiments = async () => {
      setIsLoading(true);
      const data = await getExperiments();
      setExperiments(data);
      setIsLoading(false);
    };
    fetchExperiments();
  }, []);

  const handleSelect = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (checked: boolean) => {
    setSelected(checked ? experiments.map((e) => e.id) : []);
  };

  const canCompare = selected.length >= 2 && selected.length <= 3;

  const formatLatency = (ms: number) => {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(5)}`;
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h1">
          {t("title")}
        </Typography>
        <Stack direction="row" spacing={1}>
          {canCompare && (
            <Button
              variant="contained"
              size="small"
              startIcon={<Iconify icon="mdi:compare" />}
              onClick={() => {
                router.push(
                  `/experiments/compare?ids=${selected.join(",")}`
                );
              }}
            >
              {t("compareButton")} ({selected.length})
            </Button>
          )}
          {selected.length > 3 && (
            <Tooltip title={t("compareMaxLimit")}>
              <span>
                <Button variant="contained" size="small" disabled>
                  {t("compareButton")} ({selected.length})
                </Button>
              </span>
            </Tooltip>
          )}
          {selected.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setSelected([])}
            >
              {t("clearSelection")} ({selected.length})
            </Button>
          )}
        </Stack>
      </Stack>

      <Card>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={
                      selected.length > 0 &&
                      selected.length < experiments.length
                    }
                    checked={
                      experiments.length > 0 &&
                      selected.length === experiments.length
                    }
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </TableCell>
                <TableCell>{t("id")}</TableCell>
                <TableCell>{t("name")}</TableCell>
                <TableCell>{t("promptName")}</TableCell>
                <TableCell>{t("datasetPath")}</TableCell>
                <TableCell>{t("items")}</TableCell>
                <TableCell>{t("avgLatency")}</TableCell>
                <TableCell>{t("totalCost")}</TableCell>
                <TableCell>{t("avgScore")}</TableCell>
                <TableCell>{t("createdAt")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t("loading")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && experiments.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {t("noExperiments")}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                experiments.map((exp) => (
                  <TableRow
                    hover
                    key={exp.id}
                    selected={selected.includes(exp.id)}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.includes(exp.id)}
                        onChange={() => handleSelect(exp.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <Tooltip title={exp.id}>
                        <span>{exp.id.slice(0, 13)}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        sx={{
                          cursor: "pointer",
                          color: "primary.main",
                          "&:hover": { textDecoration: "underline" },
                        }}
                        onClick={() =>
                          router.push(`/experiments/${encodeURIComponent(exp.id)}`)
                        }
                      >
                        {exp.name}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                        {exp.promptName || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 150 }}>
                        {exp.datasetPath || "-"}
                      </Typography>
                    </TableCell>
                    <TableCell>{exp.itemCount}</TableCell>
                    <TableCell>{formatLatency(exp.avgLatencyMs)}</TableCell>
                    <TableCell>{formatCost(exp.totalCost)}</TableCell>
                    <TableCell>
                      {exp.avgScore != null ? exp.avgScore.toFixed(2) : "--"}
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        {exp.createdAt || "-"}
                      </Typography>
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
