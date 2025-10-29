import { SimpleTreeView } from "@mui/x-tree-view";
import { Box, Stack } from "@mui/material";
import { TraceTreeItem } from "./trace-tree-item";
import { Iconify } from "@/components";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import { TraceLabel } from "./trace-label";
import { useMemo } from "react";

const renderTree = (node: any, findCostAndTokens: any) => {
  if (!node) {
    return null;
  }
  const { cost, tokens } = findCostAndTokens(node);

  return (
    <Stack key={node.id}>
      <TraceTreeItem
        key={node.id}
        itemId={node.id}
        labelIcon={(props) => (
          <Iconify icon="system-uicons:timeline" {...props} />
        )}
        label={
          <TraceLabel
            label={node.name}
            status={node.data.status}
            tokens={tokens}
            latency={node.data.duration}
            cost={cost}
          />
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
    onMouseDown,
    treeHeight,
  } = useTraceDrawerContext();

  const tree = useMemo(() => {
    return spanTree.map((node) => renderTree(node, findCostAndTokens));
  }, [spanTree]);

  return (
    <Box sx={{ height: treeHeight, overflowY: "auto", p: 2 }}>
      <SimpleTreeView
        expansionTrigger="iconContainer"
        selectedItems={selectedSpan?.id || null}
        onItemSelectionToggle={(_, nodeId, isSelected) => {
          if (isSelected) {
            setSelectedSpanId(nodeId);
          }
        }}
        {...(traceId
          ? {
              defaultExpandedItems: [
                traces[0]?.id!,
                ...(traces[0]?.spans.map((span) => span.id) || []),
              ],
            }
          : {})}
      >
        {tree}
      </SimpleTreeView>
    </Box>
  );
};
