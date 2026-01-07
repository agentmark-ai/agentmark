import { TraceTimeline, SpanData } from "@/sections";
import type { Meta, StoryObj } from "@storybook/react";
import { Box } from "@mui/material";
import { useState } from "react";

const meta: Meta<typeof TraceTimeline> = {
  title: "Sections/TraceTimeline",
  component: TraceTimeline,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
};

export default meta;

type Story = StoryObj<typeof TraceTimeline>;

// Mock span data for demo
const mockSpans: SpanData[] = [
  {
    id: "span-1",
    name: "generateText",
    duration: 1500,
    timestamp: 1000,
    data: {
      type: "GENERATION",
      model: "gpt-4",
      status: "success",
    },
  },
  {
    id: "span-2",
    name: "search_web",
    duration: 800,
    timestamp: 1200,
    parentId: "span-1",
    data: {
      toolCalls: JSON.stringify([{ name: "search", args: { query: "test" } }]),
      status: "success",
    },
  },
  {
    id: "span-3",
    name: "embedText",
    duration: 300,
    timestamp: 2100,
    parentId: "span-1",
    data: {
      type: "GENERATION",
      status: "success",
    },
  },
  {
    id: "span-4",
    name: "generateResponse",
    duration: 2000,
    timestamp: 2500,
    parentId: "span-1",
    data: {
      type: "GENERATION",
      model: "gpt-4",
      status: "success",
    },
  },
  {
    id: "span-5",
    name: "failed_operation",
    duration: 500,
    timestamp: 4600,
    data: {
      status: "error",
      statusMessage: "Connection timeout",
    },
  },
];

// Large mock data for virtualization testing
const generateLargeSpanData = (count: number): SpanData[] => {
  const spans: SpanData[] = [];
  let currentTime = 1000;

  for (let i = 0; i < count; i++) {
    const duration = Math.floor(Math.random() * 500) + 100;
    const types = ["GENERATION", undefined];
    const hasToolCalls = Math.random() > 0.7;

    spans.push({
      id: `span-${i}`,
      name: `Operation ${i + 1}`,
      duration,
      timestamp: currentTime,
      parentId: i > 0 && Math.random() > 0.5 ? `span-${Math.floor(Math.random() * i)}` : undefined,
      data: {
        type: types[Math.floor(Math.random() * types.length)],
        toolCalls: hasToolCalls ? JSON.stringify([{ name: "tool" }]) : undefined,
        status: Math.random() > 0.95 ? "error" : "success",
      },
    });

    currentTime += Math.floor(Math.random() * 200) + 50;
  }

  return spans;
};

// Interactive wrapper component
function InteractiveTimeline({ spans }: { spans: SpanData[] }) {
  const [selectedSpanId, setSelectedSpanId] = useState<string | undefined>();

  return (
    <Box sx={{ height: 500, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
      <TraceTimeline
        spans={spans}
        selectedSpanId={selectedSpanId}
        onSelectSpan={setSelectedSpanId}
        showRuler
        showLegend
        enableZoom
        enablePan
      />
      {selectedSpanId && (
        <Box sx={{ p: 2, borderTop: "1px solid", borderColor: "divider" }}>
          Selected: <strong>{selectedSpanId}</strong>
        </Box>
      )}
    </Box>
  );
}

export const Default: Story = {
  render: () => <InteractiveTimeline spans={mockSpans} />,
};

export const EmptyState: Story = {
  args: {
    spans: [],
  },
};

export const SingleSpan: Story = {
  args: {
    spans: [
      {
        id: "single",
        name: "Single Operation",
        duration: 1000,
        timestamp: 0,
        data: { type: "GENERATION" },
      },
    ],
  },
};

export const WithErrors: Story = {
  render: () => (
    <InteractiveTimeline
      spans={[
        ...mockSpans,
        {
          id: "error-1",
          name: "Failed API Call",
          duration: 150,
          timestamp: 5200,
          data: { status: "error", statusMessage: "API Error" },
        },
        {
          id: "error-2",
          name: "Timeout",
          duration: 3000,
          timestamp: 5400,
          data: { status: "failed" },
        },
      ]}
    />
  ),
};

export const LargeTrace: Story = {
  render: () => <InteractiveTimeline spans={generateLargeSpanData(200)} />,
  parameters: {
    docs: {
      description: {
        story: "Tests virtualization with 200 spans. Scroll to see virtualized rendering.",
      },
    },
  },
};

export const NoZoomControls: Story = {
  args: {
    spans: mockSpans,
    enableZoom: false,
    enablePan: false,
  },
};

export const NoLegend: Story = {
  args: {
    spans: mockSpans,
    showLegend: false,
  },
};

export const Loading: Story = {
  args: {
    spans: [],
    isLoading: true,
  },
};
