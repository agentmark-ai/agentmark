import { Node, Edge } from "@xyflow/react";
import dagre from "dagre";

export const NODE_DIMENSIONS = {
  width: 160,
  height: 60,
} as const;

/** Dimensions for start/end marker nodes (smaller circular) */
export const START_END_NODE_DIMENSIONS = {
  width: 40,
  height: 40,
} as const;

export interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

/**
 * Gets the dimensions for a node based on its type.
 * Start/end nodes are smaller circular markers.
 */
function getNodeDimensions(node: Node): { width: number; height: number } {
  const nodeType = (node.data as { nodeType?: string })?.nodeType;
  if (nodeType === "start" || nodeType === "end") {
    return START_END_NODE_DIMENSIONS;
  }
  return NODE_DIMENSIONS;
}

export function applyDagreLayout(nodes: Node[], edges: Edge[]): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] };
  }

  const graph = new dagre.graphlib.Graph();

  graph.setGraph({
    rankdir: "TB", // Top to bottom (vertical layout)
    nodesep: 60, // Horizontal spacing between nodes in same rank
    ranksep: 80, // Vertical spacing between ranks
    marginx: 20,
    marginy: 20,
  });

  graph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const dimensions = getNodeDimensions(node);
    graph.setNode(node.id, {
      width: dimensions.width,
      height: dimensions.height,
    });
  });

  edges.forEach((edge) => {
    graph.setEdge(edge.source, edge.target);
  });

  dagre.layout(graph);

  const layoutedNodes = nodes.map((node) => {
    const position = graph.node(node.id);
    const dimensions = getNodeDimensions(node);
    return {
      ...node,
      position: {
        x: position.x - dimensions.width / 2,
        y: position.y - dimensions.height / 2,
      },
    };
  });

  return {
    nodes: layoutedNodes,
    edges,
  };
}
