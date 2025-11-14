import { Node, Edge } from "@xyflow/react";
import dagre from "dagre";

export const NODE_DIMENSIONS = {
  width: 88,
  height: 88,
} as const;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

export function applyDagreLayout(nodes: Node[], edges: Edge[]): LayoutResult {
  const graph = new dagre.graphlib.Graph();

  graph.setGraph({
    rankdir: "TB",
    nodesep: 32,
    ranksep: 60,
  });

  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: NODE_DIMENSIONS.width,
      height: NODE_DIMENSIONS.height,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const position = graph.node(node.id);
    return {
      ...node,
      position: {
        x: position.x - NODE_DIMENSIONS.width / 2,
        y: position.y - NODE_DIMENSIONS.height / 2,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}
