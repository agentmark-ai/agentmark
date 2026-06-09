import { useMemo } from "react";
import { Card, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import {
  useTraceDrawerContext,
  useTraceHoverContext,
} from "../trace-drawer-provider";
import {
  extractPromptsFromSpan,
  extractOutputFromSpan,
} from "../span-info/tabs/hooks/use-span-prompts";
import { PromptList } from "../span-info/tabs/input-output-tab/prompt-list";
import { OutputDisplay } from "../span-info/tabs/input-output-tab/output-display";

/**
 * One card in the overview: a single trace's top-level Input/Output.
 *
 * It reads the hover context (NOT the main drawer context), so a hover
 * re-renders only the cards — not the whole drawer — and the IO extraction is
 * memoized per node, so that re-render is a cheap style flip. The highlight is
 * a border-colour + background tint only (no box-shadow / size change), so it
 * never reflows the card under the cursor — the reflow→mouseleave→mouseenter
 * loop is exactly what made hovering jumpy.
 */
const SessionIoCard = ({ traceNode }: { traceNode: any }) => {
  const { hoveredTraceId, setHoveredTraceId } = useTraceHoverContext();
  const { onSelectSpan } = useTraceDrawerContext();
  const isHighlighted = hoveredTraceId === traceNode.id;

  // span-shaped view of the trace wrapper: the extraction helpers only read
  // `name` and `data`, which the provider has merged from the root span.
  const { prompts, outputData } = useMemo(() => {
    const span = {
      id: traceNode.id,
      name: traceNode.name,
      data: traceNode.data,
    };
    return {
      prompts: extractPromptsFromSpan(span),
      outputData: extractOutputFromSpan(span),
    };
  }, [traceNode]);

  return (
    <Card
      variant="outlined"
      data-trace-id={traceNode.id}
      data-highlighted={isHighlighted ? "true" : "false"}
      onMouseEnter={() => setHoveredTraceId(traceNode.id)}
      onMouseLeave={() => setHoveredTraceId(null)}
      onClick={() => onSelectSpan(traceNode.id)}
      sx={{
        p: 1.5,
        cursor: "pointer",
        borderColor: isHighlighted ? "primary.main" : "divider",
        backgroundColor: (theme) =>
          isHighlighted
            ? alpha(theme.palette.primary.main, 0.06)
            : "transparent",
        transition: "border-color 0.15s, background-color 0.15s",
      }}
    >
      <Typography variant="subtitle2" sx={{ mb: 1, wordBreak: "break-all" }}>
        {traceNode.name}
      </Typography>
      {prompts.length > 0 && <PromptList prompts={prompts} />}
      <OutputDisplay outputData={outputData} />
    </Card>
  );
};

/**
 * Session-level overview that stacks the top-level Input/Output of EVERY trace
 * in the session into one scrollable view. A multi-step session (e.g. a sale
 * moving cal -> day-of -> prices) then reads top to bottom without clicking
 * into each trace one at a time.
 *
 * Hovering a trace's row in the TraceTree highlights its card here, and
 * hovering a card highlights its row back — both sides share the hover context.
 *
 * Each card pulls its IO from the trace's wrapper node in `spanTree` (root-span
 * data already merged up by the provider) and renders it with the SAME
 * extraction + display the single-span Input/Output tab uses, so a card is
 * identical to selecting that trace's root span. This component reads only
 * `spanTree`, so a hover never re-renders the list — only the affected cards.
 */
export const SessionIoOverview = () => {
  const { spanTree } = useTraceDrawerContext();

  if (!spanTree || spanTree.length === 0) return null;

  return (
    <Stack spacing={1.5} sx={{ p: 2 }}>
      {spanTree.map((traceNode: any) => (
        <SessionIoCard key={traceNode.id} traceNode={traceNode} />
      ))}
    </Stack>
  );
};
