import { Iconify } from "@/components";
import { Typography, IconButton, Box } from "@mui/material";
import { ReactNode } from "react";
import { useTraceDrawerContext } from "./trace-drawer-provider";

export const TraceDrawerTitle = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return <Typography variant="h6">{children}</Typography>;
};

export const TraceDrawerSubtitle = () => {
  const { selectedSpan } = useTraceDrawerContext();

  return (
    <Typography variant="subtitle1" color="primary">
      {selectedSpan?.name}
    </Typography>
  );
};

export const TraceDrawerCloseButton = ({
  onClose,
}: {
  onClose: () => void;
}) => {
  return (
    <IconButton onClick={onClose} size="small">
      <Iconify icon="eva:close-fill" />
    </IconButton>
  );
};

export const TraceDrawerHeader = ({ children }: { children: ReactNode }) => {
  return <Box p={2}>{children}</Box>;
};
