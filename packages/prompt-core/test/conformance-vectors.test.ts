/**
 * Cross-language conformance: assert every TS primitive agrees with the
 * pinned JSON vectors in `@agentmark-ai/conformance-vectors`. The mirror
 * suite in `prompt-core-python/tests/test_conformance_vectors.py` reads
 * the SAME files and asserts the SAME expected values — so any drift
 * between languages fails loudly in both CI runs.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — @agentmark-ai/conformance-vectors is a JS data package
import { loadVector } from "@agentmark-ai/conformance-vectors";
import { finalizeUsage, normalizeError } from "../src/executor-helpers";
import { computeDatasetItemName } from "../src/webhook-runner";

describe("conformance-vectors — dataset-item-name", () => {
  const { cases } = loadVector("dataset-item-name") as {
    cases: Array<{ name: string; input: unknown; index: number; expected: string }>;
  };
  for (const c of cases) {
    it(`${c.name} → ${c.expected}`, () => {
      expect(computeDatasetItemName(c.input, c.index)).toBe(c.expected);
    });
  }
});

describe("conformance-vectors — finalize-usage", () => {
  const { cases } = loadVector("finalize-usage") as {
    cases: Array<{
      name: string;
      input: {
        inputTokens: number | null;
        outputTokens: number | null;
        totalTokens: number | null;
      };
      expected: { inputTokens: number; outputTokens: number; totalTokens: number } | null;
    }>;
  };
  for (const c of cases) {
    it(c.name, () => {
      const got = finalizeUsage({
        inputTokens: c.input.inputTokens ?? 0,
        outputTokens: c.input.outputTokens ?? 0,
        totalTokens: c.input.totalTokens ?? undefined,
      });
      if (c.expected === null) {
        // Null-input case — adapters always normalize to numbers before calling,
        // so when all three are null the helper is called with zeros and
        // returns the derived {0,0,0}. The truly-null passthrough is asserted
        // separately below.
        expect(got).toEqual({ inputTokens: 0, outputTokens: 0, totalTokens: 0 });
        return;
      }
      expect(got).toEqual(c.expected);
    });
  }

  it("returns undefined when passed null or undefined", () => {
    expect(finalizeUsage(null)).toBeUndefined();
    expect(finalizeUsage(undefined)).toBeUndefined();
  });
});

describe("conformance-vectors — normalize-error", () => {
  const { cases } = loadVector("normalize-error") as {
    cases: Array<{ name: string; input: unknown; expected: string }>;
  };
  for (const c of cases) {
    it(c.name, () => {
      expect(normalizeError(c.input)).toBe(c.expected);
    });
  }
});
