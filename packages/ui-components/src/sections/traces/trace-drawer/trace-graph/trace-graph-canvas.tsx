import { Box, CircularProgress, useTheme } from "@mui/material";
import { useCallback, useEffect, useState, useMemo, KeyboardEvent } from "react";
import { GraphData, useTraceGraph, ExtendedGraphNode } from "./use-trace-graph";
import {
  Background,
  Controls,
  Node,
  ReactFlow,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  Edge,
} from "@xyflow/react";
import { TraceNode } from "./trace-node";
import { useGraphData } from "./use-graph-data";
import "@xyflow/react/dist/style.css";
import { useTraceDrawerContext } from "../trace-drawer-provider";
import type { SpanForGrouping } from "../../utils/span-grouping";

const nodeTypes = {
  traceNode: TraceNode,
};

export interface TraceGraphCanvasProps {
  graphData: GraphData[];
  isLoading: boolean;
}

export function TraceGraphCanvas({
  graphData,
  isLoading,
}: TraceGraphCanvasProps) {
  const theme = useTheme();

  const { onSelectSpan, traces } = useTraceDrawerContext();

  // Extract spans from traces for auto-generation when no manual graphData is provided
  const spansForAutoGeneration = useMemo((): SpanForGrouping[] => {
    if (graphData && graphData.length > 0) {
      // Manual graph data provided, no need for auto-generation
      return [];
    }
    // Flatten all spans from all traces
    return traces.flatMap((trace) =>
      trace.spans.map((span) => ({
        spanId: span.id,
        parentSpanId: span.parentId,
        name: span.name,
        startTime: typeof span.timestamp === 'string' ? new Date(span.timestamp).getTime() : span.timestamp,
        type: span.data?.type as string | undefined,
        data: span.data as SpanForGrouping["data"],
      }))
    );
  }, [traces, graphData]);

  const { nodes: rawNodes, edges: rawEdges } = useTraceGraph(
    graphData,
    spansForAutoGeneration
  );

  // Track current span index for each multi-span node (for cycling)
  const [nodeSpanIndices, setNodeSpanIndices] = useState<Map<string, number>>(
    () => new Map()
  );

  // Build a lookup map from node ID to node data for quick access
  const nodeMap = useMemo(() => {
    const map = new Map<string, ExtendedGraphNode>();
    rawNodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [rawNodes]);

  // Handler for single-span nodes (backward compatible)
  const onNodeClick = useCallback((spanId: string) => {
    onSelectSpan(spanId);
  }, [onSelectSpan]);

  // Handler for cycling through spans in multi-span nodes
  const onNodeCycleClick = useCallback(
    (nodeId: string) => {
      const node = nodeMap.get(nodeId);
      if (!node?.spanIds || node.spanIds.length === 0) return;

      // Get current index (default to 0)
      const currentIndex = nodeSpanIndices.get(nodeId) ?? 0;
      // Calculate next index (cycling)
      const nextIndex = (currentIndex + 1) % node.spanIds.length;
      // Get the span ID to select
      const spanIdToSelect = node.spanIds[nextIndex];

      // Update the index state
      setNodeSpanIndices((prev) => {
        const newMap = new Map(prev);
        newMap.set(nodeId, nextIndex);
        return newMap;
      });

      // Select the span
      if (spanIdToSelect) {
        onSelectSpan(spanIdToSelect);
      }
    },
    [nodeMap, nodeSpanIndices, onSelectSpan]
  );

  const { reactFlowNodes, reactFlowEdges } = useGraphData({
    nodes: rawNodes,
    edges: rawEdges,
    onNodeClick,
    onNodeCycleClick,
    nodeSpanIndices,
  });

  const [nodes, setNodes] = useState<Node[]>(reactFlowNodes);
  const [edges, setEdges] = useState<Edge[]>(reactFlowEdges);

  // Track focused node for keyboard navigation
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(-1);

  useEffect(() => {
    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);
    // Reset focus when nodes change
    setFocusedNodeIndex(-1);
  }, [reactFlowNodes, reactFlowEdges]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (nodes.length === 0) return;

      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown": {
          event.preventDefault();
          const nextIndex = focusedNodeIndex < nodes.length - 1 ? focusedNodeIndex + 1 : 0;
          setFocusedNodeIndex(nextIndex);
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          event.preventDefault();
          const prevIndex = focusedNodeIndex > 0 ? focusedNodeIndex - 1 : nodes.length - 1;
          setFocusedNodeIndex(prevIndex);
          break;
        }
        case "Enter":
        case " ": {
          event.preventDefault();
          if (focusedNodeIndex >= 0 && focusedNodeIndex < nodes.length) {
            const focusedNode = nodes[focusedNodeIndex];
            const nodeData = focusedNode?.data as { spanIds?: string[]; spanId?: string } | undefined;

            // Use cycling for multi-span nodes, direct click for single-span
            if (nodeData?.spanIds && nodeData.spanIds.length > 1 && focusedNode) {
              onNodeCycleClick(focusedNode.id);
            } else if (nodeData?.spanId) {
              onNodeClick(nodeData.spanId);
            }
          }
          break;
        }
        case "Tab": {
          // If no node is focused, focus the first node
          if (focusedNodeIndex === -1 && nodes.length > 0) {
            event.preventDefault();
            setFocusedNodeIndex(0);
          }
          break;
        }
      }
    },
    [nodes, focusedNodeIndex, onNodeClick, onNodeCycleClick]
  );

  // Update node selection state based on focused index
  useEffect(() => {
    if (focusedNodeIndex >= 0 && focusedNodeIndex < nodes.length) {
      setNodes((prevNodes) =>
        prevNodes.map((node, index) => ({
          ...node,
          selected: index === focusedNodeIndex,
        }))
      );
    }
  }, [focusedNodeIndex, nodes.length]);

  if (isLoading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          p: 2,
        }}
      >
        <CircularProgress size={20} />
      </Box>
    );
  }

  if (!nodes.length) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          p: 2,
          color: "text.secondary",
        }}
      >
        No graph data available
      </Box>
    );
  }

  return (
    <Box
      sx={{
        flexGrow: 1,
        overflow: "hidden",
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        m: 2,
        position: "relative",
        minHeight: 0,
      }}
    >
      <Box
        sx={{ width: "100%", height: "100%" }}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        role="application"
        aria-label="Workflow graph - use arrow keys to navigate between nodes, Enter to select"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) => {
            setNodes(applyNodeChanges(changes, nodes));
          }}
          onEdgesChange={(changes) => {
            setEdges(applyEdgeChanges(changes, edges));
          }}
          fitView
          zoomOnScroll
          panOnScroll
          zoomOnPinch
          fitViewOptions={{
            padding: 0.5,
          }}
        >
          <MiniMap
            style={{
              width: 80,
              height: 60,
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 4,
            }}
            nodeColor={(node) => {
              return (node.data?.color ||
                node.data?.branchColor ||
                theme.palette.primary.main) as string;
            }}
            maskColor="rgba(0, 0, 0, 0.1)"
            position="bottom-right"
          />
          <Controls
            style={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
              boxShadow: theme.shadows[4],
            }}
          />
          <Background gap={20} size={1} />
        </ReactFlow>
      </Box>
    </Box>
  );
}
