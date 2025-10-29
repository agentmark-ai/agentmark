import { Stack, Typography } from "@mui/material";

interface SpanInfoContentProps {
  children: React.ReactNode;
}

export const SpanInfoTitle = ({ children }: { children: React.ReactNode }) => {
  return (
    <Typography variant="h6" gutterBottom>
      {children}
    </Typography>
  );
};

export const SpanInfoContent = ({ children }: SpanInfoContentProps) => {
  return (
    <Stack width="100%" height="100%" overflow="hidden">
      {children}
    </Stack>
  );
};
