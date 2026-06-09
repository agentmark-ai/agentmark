import { SimpleTreeView } from "@mui/x-tree-view";
import { Box, Stack } from "@mui/material";
import { TraceTreeItem } from "./trace-tree-item";
import { Iconify } from "@/components";
import {
  useTraceDrawerContext,
  useTraceHoverContext,
} from "../trace-drawer-provider";
import { TraceLabel } from "./trace-label";
import { ReactNode, useEffect, useMemo, useState } from "react";

// A trace's row in the tree. Hovering it sets the shared hover id so the
// matching SessionIoOverview card highlights. The row's own hover affordance is
// the TreeItem's built-in `:hover` background (see CustomTreeItemContent) — we
// add NO background here, since a second one nested inside it read as a double
// highlight. (It re-renders on hover but emits identical markup — no DOM change.)
const HoverableTraceRow = ({
  traceId,
  children,
}: {
  traceId: string;
  children: ReactNode;
}) => {
  const { setHoveredTraceId } = useTraceHoverContext();
  return (
    <Box
      data-testid={`trace-hover-${traceId}`}
      onMouseEnter={() => setHoveredTraceId(traceId)}
      onMouseLeave={() => setHoveredTraceId(null)}
      sx={{ flexGrow: 1 }}
    >
      {children}
    </Box>
  );
};

const renderTree = (node: any, findCostAndTokens: any, isTraceRoot = false) => {
  if (!node) {
    return null;
  }
  const { cost, tokens } = findCostAndTokens(node);

  const traceLabel = (
    <TraceLabel
      label={node.name}
      status={node.data.status}
      tokens={tokens}
      latency={node.data.duration}
      cost={cost}
      scores={node.data.scores}
    />
  );

  return (
    <Stack key={node.id}>
      <TraceTreeItem
        key={node.id}
        itemId={node.id}
        labelIcon={(props) => (
          <Iconify icon="system-uicons:timeline" {...props} />
        )}
        label={
          // Only whole traces (top-level nodes) take part in the cross-highlight.
          isTraceRoot ? (
            <HoverableTraceRow traceId={node.id}>
              {traceLabel}
            </HoverableTraceRow>
          ) : (
            traceLabel
          )
        }
      >
        {node.children.map((child: any) =>
          renderTree(child, findCostAndTokens)
        )}
      </TraceTreeItem>
    </Stack>
  );
};
export const TraceTree = () => {
  const {
    spanTree,
    selectedSpan,
    setSelectedSpanId,
    traces,
    findCostAndTokens,
    traceId,
  } = useTraceDrawerContext();

  const tree = useMemo(() => {
    return spanTree.map((node) => renderTree(node, findCostAndTokens, true));
  }, [spanTree, findCostAndTokens]);

  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  useEffect(() => {
    if (traceId && traces[0]) {
      setExpandedItems([
        traces[0].id,
        ...(traces[0].spans.map((span) => span.id) || []),
      ]);
    }
  }, [traceId, traces]);

  return (
    <Box sx={{ height: "100%", p: 2 }}>
      {selectedSpan?.id && (
        <SimpleTreeView
          expansionTrigger="iconContainer"
          selectedItems={selectedSpan?.id || null}
          expandedItems={expandedItems}
          onExpandedItemsChange={(_, itemIds) => {
            setExpandedItems(itemIds);
          }}
          onItemSelectionToggle={(_, nodeId, isSelected) => {
            if (isSelected) {
              setSelectedSpanId(nodeId);
            }
          }}
        >
          {tree}
        </SimpleTreeView>
      )}
    </Box>
  );
};
