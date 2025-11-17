import { Box } from "@mui/material";
import { useTraceDrawerContext } from "./trace-drawer-provider";

interface TraceDrawerSidebarProps {
  children: React.ReactNode;
}

export const TraceDrawerSidebar = ({ children }: TraceDrawerSidebarProps) => {
  return (
    <Box
      width={500}
      minWidth={500}
      data-sidebar="left"
      sx={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {children}
    </Box>
  );
};

export const TraceDrawerSidebarSectionResizer = () => {
  const { onMouseDown, isDragging } = useTraceDrawerContext();
  return (
    <Box
      onMouseDown={onMouseDown}
      sx={{
        height: "8px",
        backgroundColor: isDragging ? "primary.main" : "divider",
        cursor: "row-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background-color 0.2s",
        "&:hover": {
          backgroundColor: "primary.light",
        },
      }}
    >
      <Box
        sx={{
          width: "40px",
          height: "3px",
          backgroundColor: "currentColor",
          borderRadius: "2px",
          opacity: 0.6,
        }}
      />
    </Box>
  );
};
