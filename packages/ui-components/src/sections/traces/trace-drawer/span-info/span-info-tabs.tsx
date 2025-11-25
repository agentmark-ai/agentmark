import { Tab } from "@mui/material";
import { useSpanInfoContext } from "./span-info-provider";
import { TabContext, TabList } from "@mui/lab";

interface Tab {
  value: string;
  label: string;
}

interface SpanInfoTabsProps {
  children: React.ReactNode;
}

export const SpanInfoTabs = ({ children }: SpanInfoTabsProps) => {
  const { activeTab, tabs, setActiveTab } = useSpanInfoContext();
  return (
    <TabContext value={activeTab}>
      <TabList
        onChange={(_, value) => setActiveTab(value)}
        scrollButtons={false}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        {tabs.map((tab) => (
          <Tab key={tab.value} label={tab.label} value={tab.value} />
        ))}
      </TabList>
      {children}
    </TabContext>
  );
};
