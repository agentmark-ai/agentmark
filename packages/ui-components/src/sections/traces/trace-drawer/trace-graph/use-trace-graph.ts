import { useMemo } from "react";
import { GraphEdge, GraphNode } from "./use-graph-data";

export interface GraphData {
  parentNodeId?: string;
  nodeId: string;
  spanId: string;
  nodeType: string;
  displayName: string;
  spanName: string;
}

export const useTraceGraph = (graphData: GraphData[]) => {
  const { nodes, edges } = useMemo(() => {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seenNodes = new Set<string>();
    const seenEdges = new Set<string>();

    graphData.forEach(
      ({
        displayName,
        nodeId,
        nodeType,
        parentNodeId: parentId = "",
        spanId,
        spanName,
      }) => {
        if (nodeId && !seenNodes.has(nodeId)) {
          seenNodes.add(nodeId);
          nodes.push({
            id: nodeId,
            spanId,
            label: displayName || spanName || nodeId,
            nodeType,
          });
        }

        if (parentId && parentId.trim() !== "" && nodeId) {
          const edgeKey = `${parentId}->${nodeId}`;
          if (!seenEdges.has(edgeKey)) {
            seenEdges.add(edgeKey);
            edges.push({ id: edgeKey, source: parentId, target: nodeId });
          }
        }
      }
    );

    return { nodes, edges };
  }, [graphData]);

  return { nodes, edges };
};
