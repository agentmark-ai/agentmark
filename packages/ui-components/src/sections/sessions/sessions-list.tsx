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

export interface SessionData {
  id: string;
  name: string | null;
  start: number;
  end: number | null;
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
                {format(new Date(session.start * 1000), "MMM d, yyyy h:mm:ss a")}
              </TableCell>
              <TableCell>
                {session.end
                  ? format(new Date(session.end * 1000), "MMM d, yyyy h:mm:ss a")
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

