import { Divider, Stack } from "@mui/material";

interface TraceDrawerMainProps {
  children: React.ReactNode;
}

export const TraceDrawerMain = ({ children }: TraceDrawerMainProps) => {
  return (
    <Stack
      direction="row"
      divider={<Divider orientation="vertical" flexItem />}
      sx={{ width: "100%", minHeight: 0 }}
      height="100%"
    >
      {children}
    </Stack>
  );
};
