import { TabPanel } from "@mui/lab";

interface EvaluationTabProps {
  children?: React.ReactNode;
}

export const EvaluationTab = ({ children }: EvaluationTabProps) => {
  return (
    <TabPanel
      value="evaluation"
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        p: 1,
        "&.MuiTabPanel-root": { padding: 1 },
      }}
    >
      {children}
    </TabPanel>
  );
};
