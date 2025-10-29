import * as React from "react";
import clsx from "clsx";
import { styled, useTheme, alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
  TreeItemContent,
  TreeItemRoot,
  TreeItemGroupTransition,
} from "@mui/x-tree-view/TreeItem";
import {
  useTreeItem as useTreeItem,
  UseTreeItemParameters,
} from "@mui/x-tree-view/useTreeItem";
import { TreeItemProvider } from "@mui/x-tree-view/TreeItemProvider";
import { IconButton } from "@mui/material";
import { Iconify } from "@/components";

declare module "react" {
  interface CSSProperties {
    "--tree-view-color"?: string;
    "--tree-view-bg-color"?: string;
  }
}

interface StyledTreeItemProps
  extends Omit<UseTreeItemParameters, "rootRef">,
    React.HTMLAttributes<HTMLLIElement> {
  bgColor?: string;
  bgColorForDarkMode?: string;
  color?: string;
  colorForDarkMode?: string;
  labelIcon: React.ElementType;
  labelInfo?: string;
  loading?: boolean;
  hasChildren?: boolean;
}

const CustomTreeItemRoot = styled(TreeItemRoot)(({ theme }) => ({
  color: theme.palette.text.secondary,
}));

const CustomTreeItemContent = styled(TreeItemContent)(({ theme }) => ({
  flexDirection: "row-reverse",
  borderRadius: theme.spacing(0.7),
  marginBottom: theme.spacing(0.5),
  marginTop: theme.spacing(0.5),
  padding: theme.spacing(0.5),
  paddingRight: theme.spacing(1),
  fontWeight: 500,
  [`&.Mui-expanded `]: {
    "&:not(.Mui-focused, .Mui-selected, .Mui-selected.Mui-focused) .labelIcon":
      {
        color:
          theme.palette.mode === "light"
            ? theme.palette.primary.main
            : theme.palette.primary.dark,
      },
    "&::before": {
      content: '""',
      display: "block",
      position: "absolute",
      left: "16px",
      top: "44px",
      height: "calc(100% - 48px)",
      width: "1.5px",
      backgroundColor:
        theme.palette.mode === "light"
          ? theme.palette.grey[300]
          : theme.palette.grey[700],
    },
  },
  "&:hover": {
    backgroundColor: alpha(theme.palette.primary.main, 0.1),
    color:
      theme.palette.mode === "light" ? theme.palette.primary.main : "white",
  },
  [`&.Mui-focused, &.Mui-selected, &.Mui-selected.Mui-focused`]: {
    backgroundColor:
      theme.palette.mode === "light"
        ? theme.palette.primary.main
        : theme.palette.primary.dark,
    color: theme.palette.primary.contrastText,
  },
}));

const CustomTreeItemGroupTransition = styled(TreeItemGroupTransition)(
  ({ theme }) => ({
    marginLeft: 15,
    paddingLeft: 18,
    borderLeft: `2px solid ${alpha(theme.palette.text.primary, 0.4)}`,
    [`& .content`]: {
      paddingLeft: theme.spacing(2),
    },
  })
);

const isExpandable = (reactChildren: React.ReactNode) => {
  if (Array.isArray(reactChildren)) {
    return reactChildren.length > 0 && reactChildren.some(isExpandable);
  }
  return Boolean(reactChildren);
};

export const TraceTreeItem = React.forwardRef(function TraceTreeItem(
  { hasChildren, ...props }: StyledTreeItemProps,
  ref: React.Ref<HTMLLIElement>
) {
  const theme = useTheme();
  const {
    id,
    itemId,
    label,
    disabled,
    children,
    bgColor,
    color,
    labelIcon: LabelIcon,
    labelInfo,
    colorForDarkMode,
    bgColorForDarkMode,
    loading,
    ...other
  } = props;

  const {
    getRootProps,
    getContentProps,
    getIconContainerProps,
    getLabelProps,
    getGroupTransitionProps,
    status,
  } = useTreeItem({ id, itemId, children, label, disabled, rootRef: ref });

  const style = {
    "--tree-view-color":
      theme.palette.mode !== "dark" ? color : colorForDarkMode,
    "--tree-view-bg-color":
      theme.palette.mode !== "dark" ? bgColor : bgColorForDarkMode,
  };

  return (
    <TreeItemProvider itemId={itemId} id={id}>
      <CustomTreeItemRoot {...getRootProps({ ...other, style })}>
        <CustomTreeItemContent
          {...getContentProps({
            className: clsx("content", {
              expanded: status.expanded,
              selected: status.selected,
              focused: status.focused,
            }),
          })}
        >
          <Box
            sx={{
              display: "flex",
              flexGrow: 1,
              p: 0.5,
              pr: 0,
              wordBreak: "break-all",
            }}
          >
            <Box
              component={LabelIcon}
              color="inherit"
              sx={{ mr: 1, mt: "2px", minWidth: 20, minHeight: 20 }}
            />
            {typeof label === "string" ? (
              <Typography
                {...getLabelProps({
                  variant: "body2",
                  sx: { display: "flex", fontWeight: "inherit", flexGrow: 1 },
                })}
              />
            ) : (
              label
            )}
            <Typography variant="caption" color="inherit">
              {labelInfo}
            </Typography>
            {Array.isArray(props.children) && props.children.length > 0 && (
              <IconButton
                sx={{ alignSelf: "center", ml: "auto" }}
                {...getIconContainerProps({
                  className: clsx({
                    expanded: status.expanded,
                  }),
                })}
              >
                <Iconify
                  icon={
                    status.expanded ? "mdi:chevron-down" : "mdi:chevron-right"
                  }
                />
              </IconButton>
            )}
          </Box>
        </CustomTreeItemContent>
        {children && (
          <CustomTreeItemGroupTransition {...getGroupTransitionProps()} />
        )}
      </CustomTreeItemRoot>
    </TreeItemProvider>
  );
});
