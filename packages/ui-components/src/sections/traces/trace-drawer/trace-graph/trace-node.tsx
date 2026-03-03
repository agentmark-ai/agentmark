import { memo } from "react";
import { Handle, Position, NodeProps, Node } from "@xyflow/react";
import { Box, Tooltip, Typography, useTheme } from "@mui/material";
import { Iconify } from "@/components";
import type { SpanData } from "../../types";
import { SpanNodeTooltip } from "./span-node-tooltip";

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
  /** Span data for the hover tooltip */
  spanData?: SpanData;
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

  const tooltipContent = data.spanData ? (
    <SpanNodeTooltip span={data.spanData} />
  ) : null;

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

  // Render regular rectangular node, wrapped in tooltip when span data is available
  const nodeBox = (
    <Box
      sx={{
        minWidth: 160,
        maxWidth: 220,
        backgroundColor: theme.palette.background.paper,
        borderRadius: 2,
        border: `2px solid ${borderColor}`,
        display: "flex",
        alignItems: "center",
        padding: 2,
        boxShadow: theme.shadows[3],
        cursor: "pointer",
        gap: 1.5,
        "&:hover": {
          boxShadow: theme.shadows[6],
          borderColor: borderColor,
        },
        transition: "box-shadow 0.2s ease-in-out",
      }}
      onClick={handleClick}
    >
      {data.icon && (
        <Iconify
          icon={data.icon}
          width={24}
          height={24}
          color={borderColor}
          style={{ flexShrink: 0 }}
        />
      )}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
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
              fontSize: "0.7rem",
              color: theme.palette.text.secondary,
            }}
          >
            {positionText}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: "hidden" }}
      />

      {tooltipContent ? (
        <Tooltip
          title={tooltipContent}
          placement="top"
          arrow
          enterDelay={300}
          slotProps={{
            tooltip: {
              sx: {
                bgcolor: "grey.900",
                border: "1px solid",
                borderColor: "grey.700",
                borderRadius: 1,
                p: 1,
                maxWidth: 340,
                boxShadow: 4,
              },
            },
            arrow: {
              sx: { color: "grey.900" },
            },
          }}
        >
          {nodeBox}
        </Tooltip>
      ) : (
        nodeBox
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ visibility: "hidden" }}
      />
    </>
  );
}

export const TraceNode = memo(TraceNodeComponent);
