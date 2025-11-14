"use client";

import {
  Table,
  TableBody,
  TableContainer,
} from "@mui/material";
import {
  TableHeadCustom,
  TablePaginationCustom,
  TableSkeleton,
  TableProps,
} from "../../../components/table";
import TableNoData from "../../../components/table/table-no-data";
import { TraceListItem } from "./trace-list-item";
import { Trace } from "../types";

export interface TracesListProps {
  traces: Trace[];
  isLoading: boolean;
  traceCount: number;
  table: TableProps;
  onTraceClick: (trace: Trace) => void;
  t: (key: string) => string;
}

export const TracesList = ({
  traces,
  isLoading,
  traceCount,
  table,
  onTraceClick,
  t,
}: TracesListProps) => {
  return (
    <TableContainer>
      <Table size={table.dense ? "small" : "medium"}>
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
              onClick={onTraceClick}
            />
          ))}
          {isLoading && <TableSkeleton />}
          <TableNoData
            title={t("noTraces")}
            sx={{ p: 3 }}
            notFound={!isLoading && traces.length === 0}
          />
        </TableBody>
      </Table>
      <TablePaginationCustom
        rowsPerPageOptions={[10, 20, 30]}
        count={traceCount}
        rowsPerPage={table.rowsPerPage}
        page={table.page}
        dense={table.dense}
        onChangeDense={table.onChangeDense}
        onPageChange={table.onChangePage}
        onRowsPerPageChange={table.onChangeRowsPerPage}
      />
    </TableContainer>
  );
};

