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
  TraceDrawerAddToDatasetButton,
  TraceDrawerTestPromptButton,
  SpanInfoTabs,
  AttributesTab,
  EvaluationTab,
  EvaluationList,
  InputOutputTab,
  EvaluationProvider,
  AddAnnotations,
  AddAnnotationDialog,
} from "@/sections";
import type { Meta, StoryObj } from "@storybook/react";
import { graphData, traceData } from "./mocks";
import { Box, Button, Stack } from "@mui/material";
import { useState } from "react";

const meta: Meta<typeof TraceDrawerProvider> = {
  title: "Sections/TraceDrawer",
  component: TraceDrawerProvider,
  tags: ["autodocs"],
  parameters: {},
};

export default meta;

type Story = StoryObj<typeof TraceDrawerProvider>;

export const Default: Story = {
  args: {
    traces: traceData,
    children: <DrawerTrigger />,
    t: (key) => key,
  },
};

function DrawerTrigger() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>Open Drawer</Button>
      <TraceDrawer open={open} onClose={() => setOpen(false)}>
        <TraceDrawerContainer>
          <TraceDrawerHeader>
            <Stack direction="row" justifyContent="space-between">
              <TraceDrawerTitle>Trace Drawer</TraceDrawerTitle>
              <Stack direction="row" spacing={2}>
                <TraceDrawerAddToDatasetButton>
                  Add to dataset
                </TraceDrawerAddToDatasetButton>
                <TraceDrawerTestPromptButton>
                  Test prompt
                </TraceDrawerTestPromptButton>
              </Stack>
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
                        fetchEvaluations={(spanId) => {
                          return new Promise((resolve) => {
                            setTimeout(() => {
                              resolve([
                                {
                                  id: "1",
                                  name: "Evaluation 1",
                                  score: 0.9,
                                  label: "Positive",
                                  reason: "Reason 1",
                                },
                              ]);
                            }, 1000);
                          });
                        }}
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
    </>
  );
}
