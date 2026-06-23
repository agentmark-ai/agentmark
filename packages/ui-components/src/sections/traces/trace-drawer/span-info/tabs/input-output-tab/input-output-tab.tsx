import { useMemo } from "react";
import { useSpanPrompts } from "../hooks/use-span-prompts";
import { PromptList } from "./prompt-list";
import { VariablesView } from "./variables-view";
import { OutputDisplay } from "./output-display";
import { OffloadedFields, parseOffloadedFieldNames } from "./offloaded-fields";
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
  const { prompts, outputData, isLoadingIO, blobRefs, templateProps } =
    useSpanPrompts();
  const { span } = useSpanInfoContext();

  // Fields whose full value lives in object storage — their truncated inline
  // preview is suppressed in OutputDisplay and rendered in full by OffloadedFields.
  const offloadedFields = useMemo(() => parseOffloadedFieldNames(blobRefs), [blobRefs]);

  // Template variables (frontmatter props) the prompt was rendered with —
  // shown as their own labeled section above the rendered messages when present
  // (AgentMark prompt spans). This mirrors how the ecosystem surfaces variables
  // as a distinct panel/attribute (e.g. Phoenix's "Inputs" panel, OpenInference
  // `llm.prompt_template.variables`) — separate from, not toggled against, the
  // messages. Spans with only rendered messages (run-prompt / raw-SDK) just show
  // Messages → Output.
  const hasVariables =
    !!templateProps && Object.keys(templateProps).length > 0;

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
          {hasVariables && templateProps && (
            <VariablesView variables={templateProps} />
          )}
          <PromptList prompts={prompts} />
          <OutputDisplay outputData={outputData} offloadedFields={offloadedFields} />
          {blobRefs && <OffloadedFields blobRefs={blobRefs} />}
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
