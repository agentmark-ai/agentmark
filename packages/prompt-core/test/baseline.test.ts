import { describe, it, expect } from "vitest";
import { baselineKey, baselineRequestQuery, parseBaselineResponse } from "../src/baseline";

describe("baselineKey", () => {
  it("formats the (row × scorer) join key", () => {
    expect(baselineKey("h1", "groundedness")).toBe("h1::groundedness");
  });
});

describe("baselineRequestQuery", () => {
  it("includes experiment_key + tree_hash, and dataset_path only when provided", () => {
    const q = baselineRequestQuery({ experimentKey: "agent", treeHash: "tree-abc" });
    expect(q).toContain("experiment_key=agent");
    expect(q).toContain("tree_hash=tree-abc");
    expect(q).not.toContain("dataset_path");

    expect(baselineRequestQuery({ experimentKey: "a", treeHash: "t", datasetPath: "./d.jsonl" }))
      .toContain("dataset_path=");
  });
});

describe("parseBaselineResponse", () => {
  it("parses resolved + rows into a map keyed by baselineKey", () => {
    const { resolved, baseline } = parseBaselineResponse({
      data: {
        resolved: { runId: "r1", treeHash: "tree-abc", matchedExactCommit: true },
        rows: [
          { inputHash: "h1", scorer: "groundedness", score: 0.91 },
          { inputHash: "h2", scorer: "groundedness", score: 0.8 },
        ],
      },
    });
    expect(resolved).toEqual({ runId: "r1", treeHash: "tree-abc", matchedExactCommit: true });
    expect(baseline.get(baselineKey("h1", "groundedness"))).toBe(0.91);
    expect(baseline.get(baselineKey("h2", "groundedness"))).toBe(0.8);
  });

  it("returns resolved:null + empty map for an absent/empty envelope", () => {
    expect(parseBaselineResponse({ data: { rows: [] } })).toEqual({ resolved: null, baseline: new Map() });
    expect(parseBaselineResponse({})).toEqual({ resolved: null, baseline: new Map() });
    expect(parseBaselineResponse(undefined)).toEqual({ resolved: null, baseline: new Map() });
  });

  it("skips malformed rows (missing or non-numeric score, missing fields)", () => {
    const { baseline } = parseBaselineResponse({
      data: {
        rows: [
          { inputHash: "h1", scorer: "acc", score: 0.9 },
          { inputHash: "h2", scorer: "acc" }, // no score
          { inputHash: "h3", scorer: "acc", score: "0.5" }, // non-numeric
          { scorer: "acc", score: 0.5 }, // no inputHash
        ],
      },
    });
    expect([...baseline.keys()]).toEqual(["h1::acc"]);
  });

  it("degrades to empty (does not throw) when rows is truthy but not an array", () => {
    // A malformed response where `rows` is a number / object must not crash the
    // gate — honor the "degrades gracefully rather than throwing" contract.
    expect(() => parseBaselineResponse({ data: { rows: 5 } })).not.toThrow();
    expect(parseBaselineResponse({ data: { rows: 5 } })).toEqual({ resolved: null, baseline: new Map() });
    expect(parseBaselineResponse({ data: { rows: { nope: true } } })).toEqual({ resolved: null, baseline: new Map() });
  });

  it("coerces a non-boolean matchedExactCommit to false (never silently 'exact')", () => {
    const { resolved } = parseBaselineResponse({
      data: { resolved: { runId: "r1", treeHash: "t" }, rows: [] },
    });
    expect(resolved).toEqual({ runId: "r1", treeHash: "t", matchedExactCommit: false });
  });
});
