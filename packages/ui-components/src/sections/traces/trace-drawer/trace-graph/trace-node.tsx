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
};

function TraceNodeComponent(props: NodeProps<Node<TraceNodeData>>) {
  const { data } = props;
  const theme = useTheme();

  const borderColor = data.color || data.branchColor;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{ visibility: "hidden" }}
      />

      <Box
        sx={{
          width: 88,
          height: 88,
          backgroundColor: theme.palette.background.paper,
          borderRadius: "50%",
          border: `3px solid ${borderColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          padding: 1,
          boxShadow: theme.shadows[2],
          cursor: "pointer",
          gap: 0.25,
          "&:hover": {
            transform: "scale(1.05)",
            boxShadow: theme.shadows[4],
          },
          transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
        }}
        onClick={() => {
          if (data.onNodeClick && data.spanId) {
            data.onNodeClick(data.spanId);
          }
        }}
      >
        {data.icon && (
          <Iconify
            icon={data.icon}
            width={20}
            height={20}
            color={borderColor}
          />
        )}
        <Typography
          variant="caption"
          sx={{
            fontWeight: 600,
            color: borderColor,
            textAlign: "center",
            maxWidth: 72,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            px: 0.5,
            mt: 0.25,
          }}
          title={data.label}
        >
          {data.label}
        </Typography>
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
