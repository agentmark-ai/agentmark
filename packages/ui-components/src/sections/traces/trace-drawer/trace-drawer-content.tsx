import { Stack } from "@mui/material";

interface TraceDrawerContentProps {
  children: React.ReactNode;
}

export const TraceDrawerContent = ({ children }: TraceDrawerContentProps) => {
  return (
    <Stack width="100%" height="100%" minHeight={0} overflow="hidden">
      {children}
    </Stack>
  );
};
