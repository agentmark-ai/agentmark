"use client";

import { Card, Stack, Typography } from "@mui/material";
import { RequestTable, RequestTableProps } from "./request-table";

export const Requests = (props: RequestTableProps) => {
  return (
    <Stack direction="column" spacing={2}>
      <Typography variant="h5" component="h1">
        {props.t("title")}
      </Typography>
      <Card>
        <RequestTable {...props} />
      </Card>
    </Stack>
  );
};

export default Requests;
