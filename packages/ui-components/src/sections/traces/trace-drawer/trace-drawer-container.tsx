import { Box } from "@mui/material";

export const TraceDrawerContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </Box>
  );
};
