import { Drawer } from "@mui/material";

interface TraceDrawerProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const TraceDrawer = ({ open, onClose, children }: TraceDrawerProps) => {
  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: "80%",
        },
      }}
    >
      {children}
    </Drawer>
  );
};
