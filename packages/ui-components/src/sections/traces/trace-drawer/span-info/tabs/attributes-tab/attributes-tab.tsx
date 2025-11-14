import { TabPanel } from "@mui/lab";
import { useSpanAttributes } from "../hooks/use-span-attributes";
import { AttributesViewer } from "./attributes-viewer";

export const AttributesTab = () => {
  const { transformedAttributes } = useSpanAttributes();

  const Panel = ({ children }: { children: React.ReactNode }) => {
    return (
      <TabPanel
        value="attributes"
        sx={{
          height: "100%",
          overflow: "auto",
          p: 1,
          "&.MuiTabPanel-root": { padding: 1 },
        }}
      >
        {children}
      </TabPanel>
    );
  };

  return (
    <Panel>
      <AttributesViewer attributes={transformedAttributes} />
    </Panel>
  );
};
