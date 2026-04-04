import { useSpanPrompts } from "../hooks/use-span-prompts";
import { PromptList } from "./prompt-list";
import { OutputDisplay } from "./output-display";
import { TabPanel } from "@mui/lab";
import { Alert, Box, Skeleton } from "@mui/material";
import { useSpanInfoContext } from "../../span-info-provider";

const IOLoadingSkeleton = () => (
  <Box sx={{ py: 1 }}>
    <Skeleton variant="rounded" height={24} width={80} sx={{ mb: 1 }} />
    <Skeleton variant="rounded" height={120} sx={{ mb: 2 }} />
    <Skeleton variant="rounded" height={24} width={80} sx={{ mb: 1 }} />
    <Skeleton variant="rounded" height={80} />
  </Box>
);

export const InputOutputTab = () => {
  const { prompts, outputData, isLoadingIO } = useSpanPrompts();
  const { span } = useSpanInfoContext();

  return (
    <TabPanel
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        px: 3,
        py: 1,
        "&.MuiTabPanel-root": {
          px: 3,
          py: 1,
        },
      }}
      value="inputOutput"
    >
      {isLoadingIO ? (
        <IOLoadingSkeleton />
      ) : (
        <>
          <PromptList prompts={prompts} />
          <OutputDisplay outputData={outputData} />
        </>
      )}
      {span.data.statusMessage && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {span.data.statusMessage}
        </Alert>
      )}
    </TabPanel>
  );
};
