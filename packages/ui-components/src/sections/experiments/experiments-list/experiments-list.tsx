/**
 * ExperimentsList Component
 *
 * Presentational component for listing experiments with filtering,
 * selection, comparison, and pagination. All data and callbacks
 * are provided via props — no data-fetching or routing.
 */

import { useMemo, useEffect } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import { Stack } from "@mui/system";
import {
  Iconify,
  TableHeadCustom,
  TablePaginationCustom,
  TableSkeleton,
  useTable,
} from "@/components";
import { fCurrency, fNumber } from "@/utils";
import type { ExperimentSummary } from "../types";
import { ExperimentEmptyState } from "../experiment-empty-state/experiment-empty-state";

// ----------------------------------------------------------------------

export interface ExperimentsFilterOptions {
  promptNames: string[];
  datasetPaths: string[];
}

export interface ExperimentsListProps {
  experiments: ExperimentSummary[];
  total: number;
  isLoading: boolean;
  error?: Error | null;
  filterOptions: ExperimentsFilterOptions;
  promptNameFilter: string | null;
  onPromptNameFilterChange: (value: string | null) => void;
  datasetPathFilter: string | null;
  onDatasetPathFilterChange: (value: string | null) => void;
  onExperimentClick: (experimentId: string) => void;
  onCompare?: (experimentIds: string[]) => void;
  onPageChange?: (page: number, rowsPerPage: number) => void;
  onSelectionChange?: (selectedExperiments: ExperimentSummary[]) => void;
  t: (key: string) => string;
  actionsSlot?: React.ReactNode;
  chartsSlot?: React.ReactNode;
  emptyStateDocsUrl?: string;
}

export const ExperimentsList = ({
  experiments,
  total,
  isLoading,
  error,
  filterOptions,
  promptNameFilter,
  onPromptNameFilterChange,
  datasetPathFilter,
  onDatasetPathFilterChange,
  onExperimentClick,
  onCompare,
  onPageChange,
  onSelectionChange,
  t,
  actionsSlot,
  chartsSlot,
  emptyStateDocsUrl,
}: ExperimentsListProps) => {
  const table = useTable();

  const notFound = experiments.length === 0 && !isLoading && !error;
  const showEmptyState =
    notFound && table.page === 0 && !promptNameFilter && !datasetPathFilter;

  const chartsData = useMemo(() => {
    if (table.selected.length >= 2) {
      return experiments.filter((exp) => table.selected.includes(exp.id));
    }
    return experiments;
  }, [experiments, table.selected]);

  useEffect(() => {
    onSelectionChange?.(chartsData);
  }, [chartsData, onSelectionChange]);

  if (error) {
    return (
      <Alert severity="error" sx={{ m: 2 }}>
        {error.message ?? t("loadError")}
      </Alert>
    );
  }

  return (
    <Stack height="100%" spacing={2}>
      {/* Toolbar: filters + actions */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
        sx={{ px: 1 }}
      >
        <Stack direction="row" spacing={1} flex={1}>
          <Autocomplete
            size="small"
            options={filterOptions.promptNames}
            value={promptNameFilter}
            onChange={(_, value) => {
              onPromptNameFilterChange(value);
              table.onChangePage(
                null as unknown as React.MouseEvent<HTMLButtonElement>,
                0
              );
            }}
            renderInput={(inputParams) => (
              <TextField
                {...inputParams}
                label={t("filterByPrompt")}
                size="small"
              />
            )}
            sx={{ minWidth: 200 }}
          />
          <Autocomplete
            size="small"
            options={filterOptions.datasetPaths}
            value={datasetPathFilter}
            onChange={(_, value) => {
              onDatasetPathFilterChange(value);
              table.onChangePage(
                null as unknown as React.MouseEvent<HTMLButtonElement>,
                0
              );
            }}
            renderInput={(inputParams) => (
              <TextField
                {...inputParams}
                label={t("filterByDataset")}
                size="small"
              />
            )}
            sx={{ minWidth: 200 }}
          />
        </Stack>

        <Stack direction="row" spacing={1}>
          {onCompare &&
            table.selected.length >= 2 &&
            table.selected.length <= 3 && (
              <Button
                variant="contained"
                size="small"
                color="primary"
                startIcon={<Iconify icon="mdi:compare" />}
                onClick={() => onCompare(table.selected)}
              >
                {t("compareButton")} ({table.selected.length})
              </Button>
            )}
          {onCompare && table.selected.length > 3 && (
            <Tooltip title={t("compareMaxLimit")}>
              <span>
                <Button
                  variant="contained"
                  size="small"
                  color="primary"
                  disabled
                  startIcon={<Iconify icon="mdi:compare" />}
                >
                  {t("compareButton")} ({table.selected.length})
                </Button>
              </span>
            </Tooltip>
          )}
          {table.selected.length > 0 && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => table.onSelectAllRows(false, [])}
            >
              {t("clearSelection")} ({table.selected.length})
            </Button>
          )}
          {actionsSlot}
        </Stack>
      </Stack>

      {/* Charts slot — rendered when >=2 experiments visible */}
      {chartsData.length >= 2 && chartsSlot}

      {showEmptyState ? (
        <ExperimentEmptyState t={t} docsUrl={emptyStateDocsUrl} />
      ) : (
        <Box flex={1} position="relative" overflow="auto">
          <Box
            sx={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: "100%",
            }}
          >
            <TableContainer sx={{ position: "relative", overflow: "unset" }}>
              <Table size={table.dense ? "small" : "medium"}>
                <TableHeadCustom
                  headLabel={[
                    { id: "id", label: t("id") },
                    { id: "name", label: t("name") },
                    { id: "promptName", label: t("promptName") },
                    { id: "items", label: t("items") },
                    { id: "avgLatency", label: t("avgLatency") },
                    { id: "totalCost", label: t("totalCost") },
                    { id: "avgScore", label: t("avgScore") },
                  ]}
                  rowCount={experiments.length}
                  numSelected={table.selected.length}
                  onSelectAllRows={(checked) =>
                    table.onSelectAllRows(
                      checked,
                      experiments.map((row) => row.id)
                    )
                  }
                />
                <TableBody>
                  {experiments.length > 0 &&
                    !isLoading &&
                    experiments.map((experiment) => (
                      <TableRow
                        hover
                        key={experiment.id}
                        selected={table.selected.includes(experiment.id)}
                        sx={{ cursor: "pointer" }}
                        onClick={() => onExperimentClick(experiment.id)}
                      >
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={table.selected.includes(experiment.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => table.onSelectRow(experiment.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Tooltip title={<>{experiment.id}</>}>
                            <span>{experiment.id.slice(0, 13)}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            color="primary.main"
                            sx={{
                              cursor: "pointer",
                              "&:hover": { textDecoration: "underline" },
                            }}
                          >
                            {experiment.name}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography
                            variant="body2"
                            noWrap
                            sx={{ maxWidth: 150 }}
                          >
                            {experiment.promptName || "-"}
                          </Typography>
                        </TableCell>
                        <TableCell>{experiment.itemCount}</TableCell>
                        <TableCell>
                          {fNumber(experiment.avgLatencyMs / 1000)}s
                        </TableCell>
                        <TableCell>
                          {fCurrency(experiment.totalCost, 5)}
                        </TableCell>
                        <TableCell>
                          {experiment.avgScore != null ? (
                            <Typography variant="body2">
                              {fNumber(experiment.avgScore, true)}
                            </Typography>
                          ) : (
                            <Typography
                              variant="body2"
                              color="text.disabled"
                            >
                              --
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}

                  {isLoading && <TableSkeleton />}

                  {notFound && table.page > 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                        <Typography variant="body2" color="text.disabled">
                          {t("noExperiments")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePaginationCustom
              count={total}
              page={table.page}
              rowsPerPage={table.rowsPerPage}
              onPageChange={(event, newPage) => {
                table.onChangePage(event, newPage);
                onPageChange?.(newPage, table.rowsPerPage);
              }}
              onRowsPerPageChange={(event) => {
                table.onChangeRowsPerPage(event as React.ChangeEvent<HTMLInputElement>);
                const newRowsPerPage = parseInt(event.target.value, 10);
                onPageChange?.(0, newRowsPerPage);
              }}
              dense={table.dense}
              onChangeDense={table.onChangeDense}
            />
          </Box>
        </Box>
      )}
    </Stack>
  );
};
