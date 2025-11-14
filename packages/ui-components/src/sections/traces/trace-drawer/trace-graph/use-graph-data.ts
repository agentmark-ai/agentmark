import { useMemo } from "react";
import { useTheme } from "@mui/material";
import { Node, Edge } from "@xyflow/react";
import {
  calculateBranchFamilies,
  getNodeTypeStyle,
  getBranchColor,
  applyDagreLayout,
} from "@/sections/traces/utils";

export interface GraphNode {
  id: string;
  label: string;
  spanId?: string;
  nodeType?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface UseGraphDataProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (spanId: string) => void;
}

export interface UseGraphDataResult {
  reactFlowNodes: Node[];
  reactFlowEdges: Edge[];
}

export function useGraphData({
  nodes: rawNodes,
  edges: rawEdges,
  onNodeClick,
}: UseGraphDataProps): UseGraphDataResult {
  const theme = useTheme();

  const reactFlowNodes: Node[] = useMemo(() => {
    if (!rawNodes.length) return [];

    const initialNodes = rawNodes.map((node) => ({
      id: node.id,
      data: { label: node.label },
      position: { x: 0, y: 0 },
    }));

    const initialEdges = rawEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }));

    const branchFamilies = calculateBranchFamilies(initialNodes, initialEdges);

    const styledNodes = initialNodes.map((node) => {
      const rawNode = rawNodes.find((rn) => rn.id === node.id);
      const branchFamily = branchFamilies.get(node.id) || node.id;
      const branchColor = getBranchColor(branchFamily, theme);
      const { color, icon } = getNodeTypeStyle(rawNode?.nodeType, theme);

      return {
        ...node,
        type: "traceNode",
        data: {
          label: node.data.label,
          branchColor,
          spanId: rawNode?.spanId,
          nodeType: rawNode?.nodeType,
          color,
          icon,
          onNodeClick,
        },
      };
    });

    return styledNodes;
  }, [rawNodes, rawEdges, theme, onNodeClick]);

  const reactFlowEdges: Edge[] = useMemo(
    () =>
      rawEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        animated: true,
      })),
    [rawEdges]
  );

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => applyDagreLayout(reactFlowNodes, reactFlowEdges),
    [reactFlowNodes, reactFlowEdges]
  );

  return {
    reactFlowNodes: layoutedNodes,
    reactFlowEdges: layoutedEdges,
  };
}
