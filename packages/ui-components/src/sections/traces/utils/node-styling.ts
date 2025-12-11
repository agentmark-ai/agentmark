import { Theme } from "@mui/material/styles";

export interface NodeTypeStyle {
  color: string;
  icon: string;
}

export function getNodeTypeStyle(
  nodeType: string | undefined,
  theme: Theme
): NodeTypeStyle {
  switch ((nodeType || "").toLowerCase()) {
    case "llm":
      return {
        color: theme.palette.info.main,
        icon: "mdi:robot-outline",
      };
    case "tool":
      return {
        color: theme.palette.success.main,
        icon: "mdi:wrench-outline",
      };
    case "retrieval":
      return {
        color: "#9c27b0",
        icon: "mdi:magnify",
      };
    case "router":
      return {
        color: theme.palette.warning.main,
        icon: "mdi:source-branch",
      };
    case "memory":
      return {
        color: "#795548",
        icon: "mdi:database-outline",
      };
    case "agent":
      return {
        color: theme.palette.secondary.main,
        icon: "mdi:account-cog-outline",
      };
    case "start":
      return {
        color: theme.palette.success.main,
        icon: "mdi:play-circle",
      };
    case "end":
      return {
        color: theme.palette.error.main,
        icon: "mdi:stop-circle",
      };
    default:
      return {
        color: theme.palette.primary.main,
        icon: "",
      };
  }
}

export function getBranchColor(branchFamily: string, theme: Theme): string {
  const colors = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.error.main,
    theme.palette.warning.main,
    theme.palette.info.main,
    theme.palette.success.main,
    "#9c27b0", // purple
    "#795548", // brown
    "#607d8b", // blue grey
  ];

  let hash = 0;
  for (let i = 0; i < branchFamily.length; i++) {
    const char = branchFamily.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return colors[Math.abs(hash) % colors.length]!;
}
