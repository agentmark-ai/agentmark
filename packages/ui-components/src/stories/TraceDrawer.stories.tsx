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
import { graphData, traceData } from "./mocks";
import { Box, Button, Stack } from "@mui/material";
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
