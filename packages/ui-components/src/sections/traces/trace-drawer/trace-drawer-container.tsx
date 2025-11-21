import { Divider, Stack } from "@mui/material";

export const TraceDrawerContainer = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  return (
    <Stack height="100%" divider={<Divider />}>
      {children}
    </Stack>
  );
};
