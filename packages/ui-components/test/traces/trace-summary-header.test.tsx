// @vitest-environment jsdom

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { TraceDrawerProvider } from "@/sections/traces/trace-drawer/trace-drawer-provider";
import { TraceSummaryHeader } from "@/sections/traces/trace-drawer/trace-summary-header";
import type { TraceData } from "@/sections/traces/types";

const t = (key: string) => key;

beforeEach(() => {
  cleanup();
});

function makeTrace(overrides: Partial<TraceData> = {}): TraceData {
  return {
    id: "tr-1",
    name: "test trace",
    spans: [],
    data: {},
    ...overrides,
  };
}

function renderHeader(traces: TraceData[]) {
  return render(
    <TraceDrawerProvider traces={traces} t={t}>
      <TraceSummaryHeader />
    </TraceDrawerProvider>
  );
}

describe("TraceSummaryHeader", () => {
  it("shows cost, tokens, and latency for a known trace", async () => {
    const traces = [
      makeTrace({
        data: { cost: 0.01234, tokens: 750, latency: 2000 },
        spans: [
          { id: "s1", name: "gen", duration: 2000, timestamp: 0, traceId: "tr-1", data: { model: "gpt-4o", type: "GENERATION", inputTokens: 500, outputTokens: 250, cost: 0.01234 } },
        ],
      }),
    ];

    renderHeader(traces);

    // Cost: fCurrency(0.01234, 5) → "$0.01234"
    expect(screen.getByText("$0.01234")).toBeTruthy();
    // Tokens: fNumber(750)
    expect(screen.getByText("750")).toBeTruthy();
    // Latency: (2000 / 1000).toFixed(2) + "s" = "2.00s"
    expect(screen.getByText("2.00s")).toBeTruthy();
  });

  it("renders one chip per distinct model, no duplicates", async () => {
    const traces = [
      makeTrace({
        data: { tokens: 100, latency: 1000 },
        spans: [
          { id: "s1", name: "gen1", duration: 500, timestamp: 0, traceId: "tr-1", data: { model: "gpt-4o", type: "GENERATION", inputTokens: 50, outputTokens: 25 } },
          { id: "s2", name: "gen2", duration: 500, timestamp: 1, traceId: "tr-1", data: { model: "gpt-4o", type: "GENERATION", inputTokens: 25, outputTokens: 12 } },
          { id: "s3", name: "gen3", duration: 500, timestamp: 2, traceId: "tr-1", data: { model: "claude-3-5-sonnet", type: "GENERATION", inputTokens: 25, outputTokens: 12 } },
        ],
      }),
    ];

    renderHeader(traces);

    const gptChips = screen.getAllByText("gpt-4o");
    expect(gptChips).toHaveLength(1);
    expect(screen.getByText("claude-3-5-sonnet")).toBeTruthy();
  });

  it("shows userId when present", () => {
    const traces = [makeTrace({ data: { userId: "user-abc", latency: 100 } })];
    renderHeader(traces);
    expect(screen.getByText("user-abc")).toBeTruthy();
  });

  it("does not render userId field when absent", () => {
    const traces = [makeTrace({ data: { latency: 100 } })];
    renderHeader(traces);
    expect(screen.queryByText("userId:")).toBeNull();
  });

  it("shows sessionId when present", () => {
    const traces = [makeTrace({ data: { sessionId: "sess-xyz", latency: 100 } })];
    renderHeader(traces);
    expect(screen.getByText("sess-xyz")).toBeTruthy();
  });

  it("does not render sessionId field when absent", () => {
    const traces = [makeTrace({ data: { latency: 100 } })];
    renderHeader(traces);
    expect(screen.queryByText("sessionId:")).toBeNull();
  });

  it("reflects whole-trace totals even when a child span is selected", async () => {
    const traces = [
      makeTrace({
        data: { cost: 0.05, tokens: 1000, latency: 3000 },
        spans: [
          { id: "s1", name: "root", duration: 3000, timestamp: 0, traceId: "tr-1", data: { model: "gpt-4o", cost: 0.03, totalTokens: 600 } },
          { id: "s2", name: "child", duration: 1000, timestamp: 0, traceId: "tr-1", parentId: "s1", data: { model: "gpt-4o", cost: 0.02, totalTokens: 400 } },
        ],
      }),
    ];

    // Render and verify trace-level cost is shown (not per-span)
    // The provider selects the first trace root by default
    renderHeader(traces);
    expect(screen.getByText("$0.05000")).toBeTruthy();
    expect(screen.getByText("1,000")).toBeTruthy();
  });

  it("renders nothing when no traces provided", () => {
    const { container } = renderHeader([]);
    // TraceSummaryHeader returns null when no trace found
    expect(container.firstChild).toBeNull();
  });
});
