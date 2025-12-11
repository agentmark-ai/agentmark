import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Box, Typography, useTheme } from "@mui/material";
import { Iconify } from "@/components";

type TraceNodeData = {
  label: string;
  branchColor: string;
  spanId?: string;
  nodeType?: string;
  color?: string;
  icon?: string;
  onNodeClick?: (spanId: string) => void;
  /** All span IDs for multi-span nodes (for cycling) */
  spanIds?: string[];
  /** Current span index (for position indicator) */
  currentSpanIndex?: number;
  /** Callback when node is clicked (receives nodeId for cycling) */
  onNodeCycleClick?: (nodeId: string) => void;
};

function TraceNodeComponent(props: NodeProps<Node<TraceNodeData>>) {
  const { id, data } = props;
  const theme = useTheme();

  const borderColor = data.color || data.branchColor;
  const spanCount = data.spanIds?.length || 1;
  const showPositionIndicator = spanCount > 1;
  const isStartOrEnd = data.nodeType === "start" || data.nodeType === "end";

  const handleClick = () => {
    // Start/end nodes are not clickable
    if (isStartOrEnd) return;

    // If we have cycle click handler and multiple spans, use cycling
    if (data.onNodeCycleClick && data.spanIds && data.spanIds.length > 1) {
      data.onNodeCycleClick(id);
    } else if (data.onNodeClick && data.spanId) {
      // Fall back to single span click
      data.onNodeClick(data.spanId);
    }
  };

  // Format position indicator text
  const positionText = showPositionIndicator
    ? `(${(data.currentSpanIndex ?? 0) + 1}/${spanCount})`
    : "";

  // Render icon-only circular node for start/end
  if (isStartOrEnd) {
    return (
      <>
        <Handle
          type="target"
          position={Position.Top}
          style={{ visibility: "hidden" }}
        />

        <Box
          sx={{
            width: 40,
            height: 40,
            backgroundColor: theme.palette.background.paper,
            borderRadius: "50%",
            border: `2px solid ${borderColor}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: theme.shadows[2],
          }}
        >
          {data.icon && (
            <Iconify
              icon={data.icon}
              width={24}
              height={24}
              color={borderColor}
            />
          )}
        </Box>

        <Handle
          type="source"
          position={Position.Bottom}
          style={{ visibility: "hidden" }}
        />
      </>
    );
  }

  // Render regular rectangular node
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: "hidden" }}
      />

      <Box
        sx={{
          minWidth: 120,
          maxWidth: 180,
          backgroundColor: theme.palette.background.paper,
          borderRadius: 2,
          border: `2px solid ${borderColor}`,
          display: "flex",
          alignItems: "center",
          padding: 1.5,
          boxShadow: theme.shadows[2],
          cursor: "pointer",
          gap: 1,
          "&:hover": {
            boxShadow: theme.shadows[4],
            borderColor: borderColor,
          },
          transition: "box-shadow 0.2s ease-in-out",
        }}
        onClick={handleClick}
      >
        {data.icon && (
          <Iconify
            icon={data.icon}
            width={20}
            height={20}
            color={borderColor}
            style={{ flexShrink: 0 }}
          />
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            sx={{
              fontWeight: 600,
              color: theme.palette.text.primary,
              display: "block",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={data.label}
          >
            {data.label}
          </Typography>
          {showPositionIndicator && (
            <Typography
              variant="caption"
              sx={{
                fontSize: "0.65rem",
                color: theme.palette.text.secondary,
              }}
            >
              {positionText}
            </Typography>
          )}
        </Box>
      </Box>

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: "hidden" }}
      />
    </>
  );
}

export const TraceNode = memo(TraceNodeComponent);
