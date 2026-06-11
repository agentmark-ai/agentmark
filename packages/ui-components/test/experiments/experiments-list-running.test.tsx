// @vitest-environment jsdom

/**
 * ExperimentsList — rendering of `status: "running"` placeholder rows.
 *
 * A backend can mark a summary as `running` (a dispatched run whose spans
 * haven't landed in analytics storage yet). Such rows must read as
 * placeholders: a Running label, no stats, no navigation, no selection.
 * Rows without `status` keep the existing interactive behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { ExperimentsList } from "@/sections/experiments/experiments-list/experiments-list";
import type { ExperimentSummary } from "@/sections/experiments/types";

const t = (key: string) => key;

const completed: ExperimentSummary = {
  id: "exp-done",
  name: "landed-run",
  datasetPath: "datasets/d.jsonl",
  promptName: "planner",
  itemCount: 4,
  avgLatencyMs: 2000,
  totalCost: 0.5,
  totalTokens: 100,
  avgScore: 0.75,
};

const running: ExperimentSummary = {
  id: "exp-running",
  name: "fresh-run",
  datasetPath: "datasets/d.jsonl",
  promptName: "planner",
  itemCount: 0,
  avgLatencyMs: 0,
  totalCost: 0,
  totalTokens: 0,
  avgScore: null,
  status: "running",
};

const stalled: ExperimentSummary = {
  ...running,
  id: "exp-stalled",
  name: "silent-run",
  status: "stalled",
};

beforeEach(() => {
  cleanup();
});

function renderList(
  experiments: ExperimentSummary[],
  extraProps: { onDismissExperiment?: (id: string) => void } = {},
) {
  const onExperimentClick = vi.fn();
  const utils = render(
    <ExperimentsList
      experiments={experiments}
      total={experiments.length}
      isLoading={false}
      onExperimentClick={onExperimentClick}
      t={t}
      {...extraProps}
    />,
  );
  return { ...utils, onExperimentClick };
}

describe("ExperimentsList — running placeholder rows", () => {
  it("renders the running label and no stats for a running row", () => {
    renderList([running, completed]);

    const row = screen.getByTestId("experiment-row-running");
    expect(row.textContent).toContain("fresh-run");
    expect(row.textContent).toContain("running");
    // Stats cells are placeholders, not zeros pretending to be results.
    expect(row.textContent).not.toContain("$0.00000");
    expect(row.textContent).not.toContain("0s");
  });

  it("does not navigate when a running row is clicked, but completed rows still do", () => {
    const { onExperimentClick } = renderList([running, completed]);

    fireEvent.click(screen.getByTestId("experiment-row-running"));
    expect(onExperimentClick).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("landed-run"));
    expect(onExperimentClick).toHaveBeenCalledWith("exp-done");
  });

  it("disables selection for running rows", () => {
    renderList([running, completed]);

    const row = screen.getByTestId("experiment-row-running");
    const checkbox = row.querySelector('input[type="checkbox"]');
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
  });

  it("renders completed rows exactly as before (stats + enabled checkbox)", () => {
    renderList([completed]);

    expect(screen.queryByTestId("experiment-row-running")).toBeNull();
    const row = screen.getByText("landed-run").closest("tr")!;
    expect(row.textContent).toContain("4"); // itemCount
    const checkbox = row.querySelector('input[type="checkbox"]');
    expect((checkbox as HTMLInputElement).disabled).toBe(false);
  });
});

describe("ExperimentsList — stalled placeholder rows", () => {
  it("renders the stalled warning, no stats, and no navigation", () => {
    const { onExperimentClick } = renderList([stalled, completed]);

    const row = screen.getByTestId("experiment-row-stalled");
    expect(row.textContent).toContain("silent-run");
    expect(row.textContent).toContain("stalled");
    expect(row.textContent).not.toContain("running");

    fireEvent.click(row);
    expect(onExperimentClick).not.toHaveBeenCalled();

    const checkbox = row.querySelector('input[type="checkbox"]');
    expect((checkbox as HTMLInputElement).disabled).toBe(true);
  });

  it("dismisses a stalled row via the dismiss button without navigating", () => {
    const onDismissExperiment = vi.fn();
    const { onExperimentClick } = renderList([stalled], { onDismissExperiment });

    fireEvent.click(screen.getByTestId("experiment-dismiss-stalled"));

    expect(onDismissExperiment).toHaveBeenCalledWith("exp-stalled");
    expect(onExperimentClick).not.toHaveBeenCalled();
  });

  it("renders no dismiss button when the handler is not provided", () => {
    renderList([stalled]);
    expect(screen.queryByTestId("experiment-dismiss-stalled")).toBeNull();
  });
});
