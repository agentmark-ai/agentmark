import { useSpanPrompts } from "../hooks/use-span-prompts";
import { PromptList } from "./prompt-list";
import { OutputDisplay } from "./output-display";
import { TabPanel } from "@mui/lab";
import { Alert } from "@mui/material";
import { useSpanInfoContext } from "../../span-info-provider";

export const InputOutputTab = () => {
  const { prompts, outputData } = useSpanPrompts();
  const { span } = useSpanInfoContext();

  return (
    <TabPanel
      sx={{
        height: "100%",
        overflow: "auto",
        p: 1,
        "&.MuiTabPanel-root": {
          padding: 1,
        },
      }}
      value="inputOutput"
    >
      <PromptList prompts={prompts} />
      <OutputDisplay outputData={outputData} />
      {span.data.status_message && (
        <Alert severity="error" sx={{ mt: 2 }}>
          {span.data.status_message}
        </Alert>
      )}
    </TabPanel>
  );
};
