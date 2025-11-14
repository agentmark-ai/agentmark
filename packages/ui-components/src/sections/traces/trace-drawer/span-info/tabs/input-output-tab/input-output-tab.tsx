import { useSpanPrompts } from "../hooks/use-span-prompts";
import { PromptList } from "./prompt-list";
import { OutputDisplay } from "./output-display";
import { TabPanel } from "@mui/lab";

export const InputOutputTab = () => {
  const { prompts, outputData } = useSpanPrompts();

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
    </TabPanel>
  );
};
