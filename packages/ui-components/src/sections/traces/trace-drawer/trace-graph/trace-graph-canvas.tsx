import { Box, CircularProgress, useTheme } from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { GraphData, useTraceGraph } from "./use-trace-graph";
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

  const { onSelectSpan } = useTraceDrawerContext();

  const { nodes: rawNodes, edges: rawEdges } = useTraceGraph(graphData);

  const onNodeClick = useCallback((spanId: string) => {
    onSelectSpan(spanId);
  }, []);

  const { reactFlowNodes, reactFlowEdges } = useGraphData({
    nodes: rawNodes,
    edges: rawEdges,
    onNodeClick,
  });

  const [nodes, setNodes] = useState<Node[]>(reactFlowNodes);
  const [edges, setEdges] = useState<Edge[]>(reactFlowEdges);

  useEffect(() => {
    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);
  }, [reactFlowNodes, reactFlowEdges]);

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
      <Box sx={{ width: "100%", height: "100%" }}>
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
