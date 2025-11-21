import { Node, Edge } from "@xyflow/react";

export function calculateBranchFamilies(
  nodes: Node[],
  edges: Edge[]
): Map<string, string> {
  const branchFamilies = new Map<string, string>();
  const visited = new Set<string>();

  const adjacencyList = new Map<string, Set<string>>();

  nodes.forEach((node) => {
    adjacencyList.set(node.id, new Set<string>());
  });

  edges.forEach((edge) => {
    const sourceNodes = adjacencyList.get(edge.source);
    const targetNodes = adjacencyList.get(edge.target);

    if (sourceNodes) {
      sourceNodes.add(edge.target);
    }
    if (targetNodes) {
      targetNodes.add(edge.source);
    }
  });

  function dfs(nodeId: string, familyId: string) {
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    branchFamilies.set(nodeId, familyId);

    const neighbors = adjacencyList.get(nodeId);
    if (neighbors) {
      neighbors.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          dfs(neighbor, familyId);
        }
      });
    }
  }

  nodes.forEach((node) => {
    if (!visited.has(node.id)) {
      dfs(node.id, node.id);
    }
  });

  return branchFamilies;
}
