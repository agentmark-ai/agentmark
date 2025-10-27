import {
  getGridDateOperators,
  getGridNumericOperators,
  getGridStringOperators,
  GridFilterModel,
} from "@mui/x-data-grid";
import { useMemo } from "react";
import { Request } from "./type";
import { DataGrid } from "@/components";
import { GridSortModel } from "@mui/x-data-grid";
import { GridColDef } from "@mui/x-data-grid";
import { fCurrency } from "@/utils";

export type RequestTableProps = {
  loading: boolean;
  handleFilterChange: (model: GridFilterModel) => void;
  handleSortChange: (model: GridSortModel) => void;
  requests: Request[];
  onPaginationChange: (page: number, pageSize: number) => void;
  rowsPerPage: number;
  page: number;
  totalRows: number;
  onRowClick: (row: Request) => void;
  filterModel: GridFilterModel;
  t: any;
};

export const RequestTable = ({
  loading,
  requests,
  handleFilterChange,
  handleSortChange,
  onPaginationChange,
  rowsPerPage,
  page,
  totalRows,
  onRowClick,
  filterModel,
  t,
}: RequestTableProps) => {
  const tableData = useMemo(() => {
    if (requests) {
      return requests.map((item) => ({
        ...item,
        id: item.id,
        output: item.output || item.status_message,
        user_id: item.user_id || "N/A",
      }));
    } else return [];
  }, [requests]);

  const columns = useMemo(() => {
    const col = [
      {
        field: "input",
        headerName: t("columnHeader.input"),
        width: 300,
        type: "string",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "output",
        headerName: t("columnHeader.output"),
        width: 300,
        type: "string",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "prompt_tokens",
        headerName: t("columnHeader.promptTokens"),
        width: 150,
        type: "number",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "completion_tokens",
        headerName: t("columnHeader.completionTokens"),
        width: 200,
        type: "number",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "cost",
        headerName: t("columnHeader.cost"),
        type: "number",
        width: 110,
        headerAlign: "left",
        align: "left",
        valueFormatter: (params: any) => {
          return fCurrency(params.value, 6);
        },
      },
      {
        field: "props",
        headerName: t("columnHeader.variables"),
        type: "string",
        headerAlign: "left",
        align: "left",
        width: 300,
      },
      {
        field: "latency_ms",
        headerName: t("columnHeader.latency"),
        type: "number",
        width: 100,
        headerAlign: "left",
        align: "left",
      },
      {
        field: "model_used",
        headerName: t("columnHeader.modelUsed"),
        type: "string",
        width: 200,
        headerAlign: "left",
        align: "left",
      },
      {
        field: "status",
        headerName: t("columnHeader.status"),
        type: "string",
        width: 100,
        headerAlign: "left",
        align: "left",
        valueFormatter: ({ value }) => {
          return value === "2" ? t("fail") : t("success");
        },
      },
      {
        field: "prompt_name",
        headerName: t("columnHeader.promptName"),
        width: 200,
        type: "string",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "user_id",
        headerName: t("columnHeader.user"),
        type: "string",
        width: 150,
        headerAlign: "left",
        align: "left",
      },
      {
        field: "trace_id",
        headerName: t("columnHeader.traceId"),
        width: 200,
        type: "string",
        headerAlign: "left",
        align: "left",
      },
      {
        field: "ts",
        headerName: t("columnHeader.date"),
        type: "date",
        width: 200,
        headerAlign: "left",
        align: "left",
        valueFormatter: (params: any) => {
          return new Date(params.value).toLocaleString();
        },
      },
    ] as GridColDef<Request>[];
    return col.map((item) => ({
      ...item,
      filterOperators:
        item.type === "number"
          ? getGridNumericOperators().filter(
              (op) => !op.value.includes("Empty")
            )
          : item.type === "date"
          ? getGridDateOperators()
          : getGridStringOperators().filter(
              (op) => !op.value.includes("Empty")
            ),
    }));
  }, [t]);

  return (
    <DataGrid
      t={t}
      onRowClick={(params) => onRowClick(params.row)}
      rows={tableData}
      loading={loading}
      columns={columns}
      paginationMode="server"
      onFilterModelChange={handleFilterChange}
      filterModel={filterModel}
      filterMode="server"
      rowCount={totalRows}
      showToolbar
      paginationModel={{
        page,
        pageSize: rowsPerPage,
      }}
      onSortModelChange={handleSortChange}
      pageSizeOptions={[5, 10, 25]}
      onPaginationModelChange={(model) => {
        onPaginationChange(model.page, model.pageSize);
      }}
    />
  );
};
