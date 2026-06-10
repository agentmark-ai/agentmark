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
import { deriveTraceIO } from "../src/trace-io";

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
