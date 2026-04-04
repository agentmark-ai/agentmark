"use client";

import {
  Table,
  TableCell,
  TableBody,
  TableContainer,
  TableRow,
  Typography,
} from "@mui/material";
import { format } from "date-fns";
import {
  TableHeadCustom,
  TablePaginationCustom,
  TableSkeleton,
  TableProps,
} from "../../components/table";
import TableNoData from "../../components/table/table-no-data";
import { Label } from "../../components/label";
import { Iconify } from "../../components/iconify";
import { fCurrency, fNumber } from "../../utils";

export interface SessionData {
  id: string;
  name: string | null;
  /** Milliseconds since epoch */
  start: number;
  /** Milliseconds since epoch */
  end: number | null;
  traceCount?: number;
  totalCost?: number;
  totalTokens?: number;
  /** Duration in milliseconds */
  latency?: number;
}

export interface SessionsListProps {
  sessions: SessionData[];
  isLoading: boolean;
  sessionCount: number;
  table: TableProps;
  onSessionClick: (session: SessionData) => void;
  t: (key: string) => string;
  emptyContentImgUrl?: string;
}

export const SessionsList = ({
  sessions,
  isLoading,
  sessionCount,
  table,
  onSessionClick,
  t,
  emptyContentImgUrl,
}: SessionsListProps) => {
  return (
    <TableContainer>
      <Table size={table.dense ? "small" : "medium"}>
        <TableHeadCustom
          headLabel={[
            { id: "sessionId", label: t("sessionId") },
            { id: "name", label: t("name") },
            { id: "latency", label: t("latency") },
            { id: "cost", label: t("cost") },
            { id: "tokens", label: t("tokens") },
            { id: "traces", label: t("traces") },
            { id: "startTime", label: t("startTime") },
            { id: "endTime", label: t("endTime") },
          ]}
        />
        <TableBody>
          {sessions.map((session) => (
            <TableRow
              onClick={() => onSessionClick(session)}
              hover
              key={session.id}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>
                <Label
                  color="primary"
                  sx={{
                    textTransform: "none",
                  }}
                >
                  {session.id}
                </Label>
              </TableCell>
              <TableCell>
                <Typography variant="body2">
                  {session.name || "-"}
                </Typography>
              </TableCell>
              <TableCell>
                {session.latency ? (
                  <Label color="info" startIcon={<Iconify icon="mdi:clock-outline" />}>
                    {(session.latency / 1000).toFixed(2)}s
                  </Label>
                ) : "-"}
              </TableCell>
              <TableCell>
                {session.totalCost ? fCurrency(`${session.totalCost}`, 5) : "-"}
              </TableCell>
              <TableCell>
                {session.totalTokens ? (
                  <Label color="default" startIcon={<Iconify icon="game-icons:token" />}>
                    {fNumber(session.totalTokens)}
                  </Label>
                ) : "-"}
              </TableCell>
              <TableCell>
                {session.traceCount ? (
                  <Label color="default" startIcon={<Iconify icon="mdi:layers-outline" />}>
                    {fNumber(session.traceCount)}
                  </Label>
                ) : "-"}
              </TableCell>
              <TableCell>
                {format(new Date(session.start), "MMM d, yyyy h:mm a")}
              </TableCell>
              <TableCell>
                {session.end
                  ? format(new Date(session.end), "MMM d, yyyy h:mm a")
                  : "-"}
              </TableCell>
            </TableRow>
          ))}
          {isLoading && <TableSkeleton />}
          <TableNoData
            title={t("noSessions")}
            sx={{ p: 3 }}
            notFound={!isLoading && sessions.length === 0}
            imgUrl={emptyContentImgUrl}
          />
        </TableBody>
      </Table>
      <TablePaginationCustom
        rowsPerPageOptions={[10, 20, 30]}
        count={sessionCount}
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
