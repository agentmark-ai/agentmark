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
  /** All span IDs for multi-span nodes */
  spanIds?: string[];
  /** Number of spans in this node */
  spanCount?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** True if edge represents bidirectional flow (A→B and B→A) */
  bidirectional?: boolean;
}

export interface UseGraphDataProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (spanId: string) => void;
  /** Handler for cycling through spans in multi-span nodes */
  onNodeCycleClick?: (nodeId: string) => void;
  /** Map of node ID to current span index (for position indicator) */
  nodeSpanIndices?: Map<string, number>;
}

export interface UseGraphDataResult {
  reactFlowNodes: Node[];
  reactFlowEdges: Edge[];
}

export function useGraphData({
  nodes: rawNodes,
  edges: rawEdges,
  onNodeClick,
  onNodeCycleClick,
  nodeSpanIndices,
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
      const currentSpanIndex = nodeSpanIndices?.get(node.id);

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
          spanIds: rawNode?.spanIds,
          currentSpanIndex,
          onNodeCycleClick,
        },
      };
    });

    return styledNodes;
  }, [rawNodes, rawEdges, theme, onNodeClick, onNodeCycleClick, nodeSpanIndices]);

  const reactFlowEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];

    rawEdges.forEach((edge) => {
      edges.push({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "default",
        animated: true,
      });
    });

    return edges;
  }, [rawEdges]);

  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => applyDagreLayout(reactFlowNodes, reactFlowEdges),
    [reactFlowNodes, reactFlowEdges]
  );

  return {
    reactFlowNodes: layoutedNodes,
    reactFlowEdges: layoutedEdges,
  };
}
