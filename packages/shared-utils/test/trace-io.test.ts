/**
 * Pins the canonical trace-level I/O derivation (`deriveTraceIO`) shared by
 * the cloud gateway's `transformTraceDetail`, the CLI's `mapRawTraceToDetail`
 * (`GET /v1/traces/:id`), and the CLI's dataset import-from-traces mapper.
 *
 * Layered semantics: root span's I/O wins (the WebhookRunner records
 * agentmark.input/output there); first/last GENERATION span is the fallback;
 * fields resolve independently.
 */
import { describe, it, expect } from "vitest";
import {
  deriveTraceIO,
  attachTraceIOPreviews,
  TRACE_IO_PREVIEW_MAX_CHARS,
} from "../src/trace-io";

const ROOT = {
  parentId: null,
  type: "SPAN",
  timestamp: "2026-06-09T10:00:00.000Z",
};
const GEN_1 = {
  parentId: "root",
  type: "GENERATION",
  timestamp: "2026-06-09T10:00:01.000Z",
};
const GEN_2 = {
  parentId: "root",
  type: "GENERATION",
  timestamp: "2026-06-09T10:00:02.000Z",
};

describe("deriveTraceIO", () => {
  it("prefers the root span's input/output when present", () => {
    const io = deriveTraceIO([
      { ...ROOT, input: '[{"role":"user","content":"hi"}]', output: "root-out" },
      { ...GEN_1, input: "gen-in", output: "gen-out" },
    ]);
    expect(io.input).toBe('[{"role":"user","content":"hi"}]');
    expect(io.output).toBe("root-out");
  });

  it("falls back to first GENERATION input / last GENERATION output", () => {
    const io = deriveTraceIO([
      { ...ROOT, input: "", output: "" },
      { ...GEN_2, input: "second-in", output: "final-answer" },
      { ...GEN_1, input: "first-in", output: "intermediate" },
    ]);
    // Timestamp order, not array order.
    expect(io.input).toBe("first-in");
    expect(io.output).toBe("final-answer");
  });

  it("resolves fields independently (root output only → input from fallback)", () => {
    const io = deriveTraceIO([
      { ...ROOT, output: "root-out" },
      { ...GEN_1, input: "gen-in", output: "gen-out" },
    ]);
    expect(io.input).toBe("gen-in");
    expect(io.output).toBe("root-out");
  });

  it("skips GENERATION spans with empty I/O when falling back", () => {
    const io = deriveTraceIO([
      { ...ROOT },
      { ...GEN_1, input: "", output: "early-out" },
      { ...GEN_2, input: "late-in", output: "" },
    ]);
    // First generation WITH input; last generation WITH output.
    expect(io.input).toBe("late-in");
    expect(io.output).toBe("early-out");
  });

  it("omits both fields when nothing carries I/O", () => {
    const io = deriveTraceIO([{ ...ROOT }, { ...GEN_1 }]);
    expect("input" in io).toBe(false);
    expect("output" in io).toBe(false);
  });

  it("treats the first span as root when no parentless span exists", () => {
    const io = deriveTraceIO([
      { parentId: "elsewhere", type: "SPAN", timestamp: 1, input: "virtual-root-in" },
    ]);
    expect(io.input).toBe("virtual-root-in");
  });

  it("orders epoch-number timestamps correctly", () => {
    const io = deriveTraceIO([
      { parentId: null, type: "SPAN", timestamp: 0 },
      { parentId: "r", type: "GENERATION", timestamp: 200, output: "late" },
      { parentId: "r", type: "GENERATION", timestamp: 100, input: "early" },
    ]);
    expect(io.input).toBe("early");
    expect(io.output).toBe("late");
  });

  it("keeps non-string payloads (parsed wire spans) intact", () => {
    const io = deriveTraceIO([
      { ...ROOT, input: [{ role: "user", content: "hi" }], output: { a: 1 } },
    ]);
    expect(io.input).toEqual([{ role: "user", content: "hi" }]);
    expect(io.output).toEqual({ a: 1 });
  });

  it("returns empty for an empty span list", () => {
    expect(deriveTraceIO([])).toEqual({});
  });
});

/**
 * Pins the shared "rows → one preview per trace" step used by BOTH the cloud
 * trace service (ClickHouse rows) and the local CLI server (SQLite rows). The
 * point of this helper existing is that those two paths can never derive a
 * preview differently — so the tests assert grouping, fallback, isolation, and
 * the blank-rejection guard that protect that invariant.
 */
describe("attachTraceIOPreviews", () => {
  type Row = Parameters<typeof attachTraceIOPreviews>[1][number];
  const row = (over: Partial<Row> & { traceId: string }): Row => ({
    parentId: null,
    type: "SPAN",
    timestamp: 0,
    input: null,
    output: null,
    ...over,
  });

  it("derives input/output from the root span when it carries them", () => {
    const traces = [{ id: "t1" }];
    attachTraceIOPreviews(traces, [
      row({ traceId: "t1", parentId: null, type: "SPAN", timestamp: 1, input: "root in", output: "root out" }),
      row({ traceId: "t1", parentId: "s-root", type: "GENERATION", timestamp: 2, input: "gen in", output: "gen out" }),
    ]);
    expect(traces[0]).toEqual({ id: "t1", inputPreview: "root in", outputPreview: "root out" });
  });

  it("falls back to first-GENERATION input / last-GENERATION output when the root has none", () => {
    const traces = [{ id: "t1" }];
    attachTraceIOPreviews(traces, [
      row({ traceId: "t1", parentId: null, type: "SPAN", timestamp: 1 }),
      row({ traceId: "t1", parentId: "s", type: "GENERATION", timestamp: 3, input: "last in", output: "last out" }),
      row({ traceId: "t1", parentId: "s", type: "GENERATION", timestamp: 2, input: "first in", output: "first out" }),
    ]);
    // input = FIRST generation (ts 2), output = LAST generation (ts 3) — by
    // timestamp, not row order.
    expect(traces[0]).toEqual({ id: "t1", inputPreview: "first in", outputPreview: "last out" });
  });

  it("groups rows per trace — no cross-trace bleed", () => {
    const traces = [{ id: "t1" }, { id: "t2" }];
    attachTraceIOPreviews(traces, [
      row({ traceId: "t1", input: "t1 in", output: "t1 out" }),
      row({ traceId: "t2", input: "t2 in", output: "t2 out" }),
    ]);
    expect(traces[0]).toEqual({ id: "t1", inputPreview: "t1 in", outputPreview: "t1 out" });
    expect(traces[1]).toEqual({ id: "t2", inputPreview: "t2 in", outputPreview: "t2 out" });
  });

  it("leaves a trace with no source rows untouched (no preview keys assigned)", () => {
    const traces = [{ id: "t1" }, { id: "t2" }];
    attachTraceIOPreviews(traces, [row({ traceId: "t1", input: "only t1", output: "only t1 out" })]);
    expect(traces[1]).toEqual({ id: "t2" });
    expect("inputPreview" in traces[1]).toBe(false);
  });

  it("never overwrites with an empty string (deriveTraceIO rejects blanks)", () => {
    const traces = [{ id: "t1" }];
    attachTraceIOPreviews(traces, [row({ traceId: "t1", type: "SPAN", input: "", output: "" })]);
    expect(traces[0]).toEqual({ id: "t1" });
  });

  it("returns the same array reference it mutated in place", () => {
    const traces = [{ id: "t1" }];
    expect(attachTraceIOPreviews(traces, [])).toBe(traces);
  });
});

describe("TRACE_IO_PREVIEW_MAX_CHARS", () => {
  it("is the canonical 160-char preview cut shared by cloud and local", () => {
    expect(TRACE_IO_PREVIEW_MAX_CHARS).toBe(160);
  });
});
