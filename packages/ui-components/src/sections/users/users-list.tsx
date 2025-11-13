"use client";

import {
  getGridNumericOperators,
  getGridStringOperators,
  GridColDef,
  GridFilterModel,
  GridSortModel,
} from "@mui/x-data-grid";
import { useMemo } from "react";
import { User } from "./type";
import { DataGrid } from "@/components";
import { fCurrency, fShortenNumber } from "@/utils";
import { Tooltip } from "@mui/material";

export type UsersListProps = {
  loading: boolean;
  onFilterChange?: (model: GridFilterModel) => void;
  onSortChange?: (model: GridSortModel) => void;
  users: User[];
  onPaginationChange?: (page: number, pageSize: number) => void;
  rowsPerPage?: number;
  page?: number;
  totalRows?: number;
  onRowClick?: (row: User) => void;
  filterModel?: GridFilterModel;
  filterMode?: "server" | "client";
  paginationMode?: "server" | "client";
  sortingMode?: "server" | "client";
  t: any;
};

export const UsersList = ({
  loading,
  users,
  onFilterChange,
  onSortChange,
  onPaginationChange,
  rowsPerPage,
  page,
  totalRows,
  onRowClick,
  filterModel,
  filterMode,
  paginationMode,
  sortingMode,
  t,
}: UsersListProps) => {
  const tableData = useMemo(() => {
    if (users) {
      return users.map((item) => ({
        ...item,
        id: item.user_id,
        count: item.count ?? 0,
        total_cost: item.total_cost ?? 0,
        avg_tokens: item.avg_tokens ?? 0,
        completion_tokens: item.completion_tokens ?? 0,
        prompt_tokens: item.prompt_tokens ?? 0,
        avg_requests_per_day: item.avg_requests_per_day ?? 0,
      }));
    } else return [];
  }, [users]);

  const columns = useMemo(() => {
    const col = [
      {
        field: "user_id",
        headerName: t("columnHeader.userId"),
        width: 170,
        type: "string",
        headerAlign: "left",
        align: "left",
        renderCell: ({ value }: { value: string }) => {
          return (
            <Tooltip title={value}>
              <span>
                {value && value.length > 13
                  ? `${value.slice(0, 13)}...`
                  : value}
              </span>
            </Tooltip>
          );
        },
      },
      {
        field: "count",
        headerName: t("columnHeader.requests"),
        width: 200,
        type: "number",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "total_cost",
        headerName: t("columnHeader.cost"),
        width: 200,
        type: "number",
        headerAlign: "left",
        align: "left",
        valueFormatter: (value: number) => {
          if (value === null || value === undefined || value === 0) return "$0";
          const formatted = fCurrency(value, 6);
          return formatted || "$0";
        },
      },
      {
        field: "avg_tokens",
        headerName: t("columnHeader.avgTokens"),
        width: 200,
        type: "number",
        headerAlign: "left",
        align: "left",
        valueFormatter: (value: number) => {
          if (value === null || value === undefined || value === 0) return "0";
          const formatted = fShortenNumber(value);
          return formatted || "0";
        },
      },
      {
        field: "completion_tokens",
        headerName: t("columnHeader.completionTokens"),
        width: 240,
        type: "number",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "prompt_tokens",
        headerName: t("columnHeader.promptTokens"),
        width: 250,
        type: "number",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "avg_requests_per_day",
        headerName: t("columnHeader.avgRequestsPerDay"),
        width: 300,
        type: "number",
        headerAlign: "left",
        align: "left",
        valueFormatter: (value: number) => {
          if (value === null || value === undefined || value === 0) return "0";
          const formatted = fShortenNumber(value);
          return formatted || "0";
        },
      },
    ] as GridColDef<User>[];
    return col.map((col) => ({
      ...col,
      filterOperators:
        col.type === "number"
          ? getGridNumericOperators().filter(
              (op) => !op.value.includes("Empty")
            )
          : getGridStringOperators().filter(
              (op) => !op.value.includes("Empty")
            ),
    }));
  }, [t]);

  return (
    <DataGrid
      t={t}
      onRowClick={onRowClick ? (params) => onRowClick(params.row) : undefined}
      rows={tableData}
      loading={loading}
      columns={columns}
      paginationMode={paginationMode}
      onFilterModelChange={onFilterChange}
      filterModel={filterModel}
      filterMode={filterMode}
      rowCount={onPaginationChange ? totalRows : undefined}
      paginationModel={
        paginationMode === "server"
          ? { page: page || 0, pageSize: rowsPerPage || 10 }
          : undefined
      }
      onSortModelChange={onSortChange}
      showToolbar
      sortingMode={sortingMode}
      pageSizeOptions={[5, 10, 25]}
      initialState={{
        pagination:
          paginationMode !== "server"
            ? {
                paginationModel: {
                  page: 0,
                  pageSize: 10,
                },
              }
            : undefined,
      }}
      rowSelection={false}
      onPaginationModelChange={(model) => {
        onPaginationChange?.(model.page, model.pageSize);
      }}
    />
  );
};
