/**
 * Cross-language control-plane conformance: assert the TS `buildEvalsResponse`
 * agrees with the pinned JSON vectors in `@agentmark-ai/conformance-vectors`.
 * The mirror suite in `prompt-core-python/tests/test_control_plane.py` reads
 * the SAME `control-plane.json` and asserts the SAME expected envelopes — so
 * any divergence in the `get-evals` wire payload (key rename, name reordering,
 * the `result` JSON-string spacing) fails loudly in both CI runs instead of
 * surfacing as a dashboard parse bug for one language's users.
 *
 * Also pins that the real `AgentMark` client satisfies the `ControlPlaneClient`
 * contract (`getEvalNames` reads its eval registry).
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — @agentmark-ai/conformance-vectors is a JS data package
import { loadVector } from "@agentmark-ai/conformance-vectors";
import { buildEvalsResponse, type ControlPlaneClient } from "../src/control-plane";
import { AgentMark } from "../src/agentmark";
import { DefaultAdapter } from "../src/adapters/default";

interface ControlPlaneCase {
  name: string;
  evalNames: string[];
  expected: { type: "evals"; result: string; traceId: string };
}

const { cases } = loadVector("control-plane") as { cases: ControlPlaneCase[] };

const stubClient = (names: string[]): ControlPlaneClient => ({
  getEvalNames: () => names,
});

describe("conformance-vectors — control-plane (get-evals)", () => {
  for (const c of cases) {
    it(c.name, () => {
      expect(buildEvalsResponse(stubClient(c.evalNames))).toEqual(c.expected);
    });
  }

  it("sorts names and emits a compact, raw-UTF-8 `result` (byte-identical to Python)", () => {
    // The dashboard JSON.parses `result`; the bytes must match across languages:
    // sorted order, no spaces, non-ASCII left raw.
    expect(buildEvalsResponse(stubClient(["b", "a"])).result).toBe('["a","b"]');
    expect(buildEvalsResponse(stubClient(["café", "10"])).result).toBe('["10","café"]');
  });
});

describe("AgentMark satisfies the ControlPlaneClient contract", () => {
  it("getEvalNames returns raw registry order; buildEvalsResponse canonicalizes (sorts)", () => {
    // Register out of sorted order to prove the split: getEvalNames is raw,
    // the wire helper sorts.
    const client = new AgentMark({
      adapter: new DefaultAdapter() as any,
      evals: { safety: (p: any) => p, accuracy: (p: any) => p },
    });
    // Assignable to ControlPlaneClient (compile-time) and behaves at runtime:
    const cp: ControlPlaneClient = client;
    expect(cp.getEvalNames()).toEqual(["safety", "accuracy"]); // raw insertion order
    expect(buildEvalsResponse(cp).result).toBe('["accuracy","safety"]'); // sorted on the wire
  });

  it("yields an empty list when no evals are registered", () => {
    const client = new AgentMark({ adapter: new DefaultAdapter() as any });
    expect(client.getEvalNames()).toEqual([]);
    expect(buildEvalsResponse(client).result).toBe("[]");
  });
});
