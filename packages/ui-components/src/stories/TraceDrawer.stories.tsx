import {
  TraceDrawer,
  TraceDrawerContainer,
  TraceDrawerContent,
  TraceDrawerHeader,
  TraceDrawerMain,
  TraceDrawerProvider,
  TraceDrawerSidebar,
  TraceDrawerSidebarSectionResizer,
  TraceDrawerSubtitle,
  TraceDrawerTitle,
  TraceTree,
  SpanInfoProvider,
  SpanInfoContent,
  SpanInfoHeader,
  TraceGraphCanvas,
  TraceTimeline,
  SpanInfoTabs,
  AttributesTab,
  EvaluationTab,
  EvaluationList,
  InputOutputTab,
  EvaluationProvider,
  AddAnnotations,
  AddAnnotationDialog,
  ScoreData,
  SpanData,
} from "@/sections";
import type { Meta, StoryObj } from "@storybook/react";
import { graphData, traceData, workflowTraceData } from "./mocks";
import {
  Box,
  Button,
  Stack,
  Tabs,
  Tab,
  Divider,
  Typography,
  Snackbar,
} from "@mui/material";
import { useState, useCallback } from "react";

const meta: Meta<typeof DrawerTrigger> = {
  title: "Sections/TraceDrawer",
  component: DrawerTrigger,
  tags: ["autodocs"],
  parameters: {},
};

export default meta;

type Story = StoryObj<typeof DrawerTrigger>;

function DrawerTrigger() {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleSpanChange = useCallback(async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }

    setIsLoading(true);
    // Simulate API call
    setTimeout(() => {
      setScores([
        {
          id: "1",
          name: "Evaluation 1",
          score: 0.9,
          label: "Positive",
          reason: "Reason 1",
        },
      ]);
      setIsLoading(false);
    }, 1000);
  }, []);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Drawer</Button>
      <TraceDrawerProvider
        traces={traceData}
        t={(key) => key}
        onSpanChange={handleSpanChange}
      >
        <TraceDrawer open={open} onClose={() => setOpen(false)}>
          <TraceDrawerContainer>
            <TraceDrawerHeader>
              <Stack direction="row" justifyContent="space-between">
                <TraceDrawerTitle>Trace Drawer</TraceDrawerTitle>
              </Stack>
              <TraceDrawerSubtitle />
            </TraceDrawerHeader>

            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
            >
              <TraceDrawerMain>
                <TraceDrawerSidebar>
                  <TraceTree />
                  <TraceDrawerSidebarSectionResizer />
                  <TraceGraphCanvas graphData={graphData} isLoading={false} />
                </TraceDrawerSidebar>
                <TraceDrawerContent>
                  <SpanInfoProvider>
                    <SpanInfoHeader />
                    <SpanInfoContent>
                      <SpanInfoTabs>
                        <AttributesTab />
                        <InputOutputTab />
                        <EvaluationProvider
                          canAddAnnotation={true}
                          scores={scores}
                          isLoading={isLoading}
                        >
                          <EvaluationTab>
                            <Stack spacing={2}>
                              <Stack direction="row" justifyContent="flex-end">
                                <AddAnnotations />
                                <AddAnnotationDialog
                                  saveAnnotation={() =>
                                    Promise.resolve({ hasError: false })
                                  }
                                />
                              </Stack>
                              <EvaluationList />
                            </Stack>
                          </EvaluationTab>
                        </EvaluationProvider>
                      </SpanInfoTabs>
                    </SpanInfoContent>
                  </SpanInfoProvider>
                </TraceDrawerContent>
              </TraceDrawerMain>
            </Box>
          </TraceDrawerContainer>
        </TraceDrawer>
      </TraceDrawerProvider>
    </>
  );
}

export const Default: Story = {
  args: {},
};

/**
 * Tab-based layout following industry patterns (Jaeger, Datadog, LangSmith).
 * - TraceTree always visible on left for navigation
 * - Main area has tabs: Timeline | Graph | Details
 * - Each tab gets full width
 * - Clicking a span in Timeline/Graph switches to Details tab
 */
type ViewTab = "timeline" | "graph" | "details";

function DrawerWithTabs() {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<ScoreData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ViewTab>("timeline");
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleSpanChange = useCallback(async (span: SpanData | null) => {
    if (!span?.id) {
      setScores([]);
      return;
    }
    setSelectedSpanId(span.id);
    setIsLoading(true);
    setTimeout(() => {
      setScores([
        {
          id: "1",
          name: "Evaluation 1",
          score: 0.9,
          label: "Positive",
          reason: "Reason 1",
        },
      ]);
      setIsLoading(false);
    }, 1000);
  }, []);

  // When a span is clicked in Timeline or Graph, switch to Details tab
  const handleSpanSelect = useCallback((spanId: string) => {
    setSelectedSpanId(spanId);
    setActiveTab("details");
    setSnackbarOpen(true);
  }, []);

  const handleTabChange = (_: React.SyntheticEvent, newValue: ViewTab) => {
    setActiveTab(newValue);
  };

  // Timeline tab content
  const renderTimelineTab = () => (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      <TraceTimeline
        spans={workflowTraceData.spans}
        selectedSpanId={selectedSpanId}
        onSelectSpan={handleSpanSelect}
        showRuler
        showLegend
        enableZoom
        enablePan
      />
    </Box>
  );

  // Graph tab content
  const renderGraphTab = () => (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <TraceGraphCanvas graphData={graphData} isLoading={false} />
    </Box>
  );

  // Details tab content
  const renderDetailsTab = () => (
    <Box sx={{ height: "100%", overflow: "auto" }}>
      {selectedSpanId ? (
        <SpanInfoProvider>
          <SpanInfoHeader />
          <SpanInfoContent>
            <SpanInfoTabs>
              <AttributesTab />
              <InputOutputTab />
              <EvaluationProvider
                canAddAnnotation={true}
                scores={scores}
                isLoading={isLoading}
              >
                <EvaluationTab>
                  <Stack spacing={2}>
                    <Stack direction="row" justifyContent="flex-end">
                      <AddAnnotations />
                      <AddAnnotationDialog
                        saveAnnotation={() =>
                          Promise.resolve({ hasError: false })
                        }
                      />
                    </Stack>
                    <EvaluationList />
                  </Stack>
                </EvaluationTab>
              </EvaluationProvider>
            </SpanInfoTabs>
          </SpanInfoContent>
        </SpanInfoProvider>
      ) : (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            color: "text.secondary",
          }}
        >
          <Typography variant="body2">
            Select a span from Timeline or Graph to view details
          </Typography>
        </Box>
      )}
    </Box>
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Drawer (Tab Layout)</Button>
      <TraceDrawerProvider
        traces={traceData}
        t={(key) => key}
        onSpanChange={handleSpanChange}
      >
        <TraceDrawer open={open} onClose={() => setOpen(false)}>
          <TraceDrawerContainer>
            <TraceDrawerHeader>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <TraceDrawerTitle>Trace Drawer</TraceDrawerTitle>
              </Stack>
              <TraceDrawerSubtitle />
            </TraceDrawerHeader>

            <Box
              sx={{
                display: "flex",
                flexDirection: "row",
                width: "100%",
                height: "100%",
                overflow: "hidden",
              }}
            >
              {/* Left sidebar: TraceTree (always visible for navigation) */}
              <Box
                sx={{
                  width: 280,
                  minWidth: 280,
                  borderRight: 1,
                  borderColor: "divider",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1,
                    borderBottom: 1,
                    borderColor: "divider",
                    backgroundColor: "action.hover",
                  }}
                >
                  <Typography variant="subtitle2">Spans</Typography>
                </Box>
                <Box sx={{ flex: 1, overflow: "auto" }}>
                  <TraceTree />
                </Box>
              </Box>

              {/* Main content area with tabs */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                }}
              >
                {/* Tab bar */}
                <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
                  <Tabs
                    value={activeTab}
                    onChange={handleTabChange}
                    aria-label="Trace view tabs"
                  >
                    <Tab label="Timeline" value="timeline" />
                    <Tab label="Graph" value="graph" />
                    <Tab label="Details" value="details" />
                  </Tabs>
                </Box>

                {/* Tab content */}
                <Box sx={{ flex: 1, overflow: "hidden" }}>
                  {activeTab === "timeline" && renderTimelineTab()}
                  {activeTab === "graph" && renderGraphTab()}
                  {activeTab === "details" && renderDetailsTab()}
                </Box>
              </Box>
            </Box>
          </TraceDrawerContainer>
        </TraceDrawer>
      </TraceDrawerProvider>

      {/* Snackbar notification when switching to details */}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2000}
        onClose={() => setSnackbarOpen(false)}
        message="Switched to Details tab"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </>
  );
}

export const TabLayout: Story = {
  render: () => <DrawerWithTabs />,
  parameters: {
    docs: {
      description: {
        story:
          "Tab-based layout following industry patterns. TraceTree is always visible for navigation. Main area has Timeline, Graph, and Details tabs. Clicking a span in Timeline or Graph auto-switches to the Details tab.",
      },
    },
  },
};
