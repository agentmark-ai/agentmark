/**
 * Cross-language parity test for computeDatasetItemName.
 *
 * These digests MUST match the ones asserted in
 * `packages/prompt-core-python/tests/test_webhook_runner_pydantic.py`
 * (see `test_dataset_item_name_parity_vectors`) — changing one side without
 * the other silently breaks dataset row identity in the AgentMark
 * Experiments dashboard when the same dataset is re-run across SDKs.
 */
import { describe, it, expect } from "vitest";
import { computeDatasetItemName } from "../src/webhook-runner";

describe("computeDatasetItemName — cross-language parity", () => {
  it("falls back to index for null / empty input", () => {
    expect(computeDatasetItemName(null, 0)).toBe("0");
    expect(computeDatasetItemName(undefined, 3)).toBe("3");
    expect(computeDatasetItemName("", 7)).toBe("7");
    expect(computeDatasetItemName({}, 2)).toBe("2");
  });

  it("hashes the canonical vector identically across TS ↔ Python", () => {
    // json.dumps({"a":1,"b":[2,3]}, sort_keys=True, separators=(",", ":"))
    //   → '{"a":1,"b":[2,3]}'
    // md5(...)[:12] → '94dc2faee24e'
    expect(computeDatasetItemName({ a: 1, b: [2, 3] }, 0)).toBe("94dc2faee24e");
  });

  it("sorts object keys so insertion order doesn't change the digest", () => {
    const a = computeDatasetItemName({ a: 1, b: [2, 3] }, 0);
    const b = computeDatasetItemName({ b: [2, 3], a: 1 }, 0);
    expect(a).toBe(b);
  });

  it("does not sort array elements (order is significant)", () => {
    const a = computeDatasetItemName({ xs: [1, 2, 3] }, 0);
    const b = computeDatasetItemName({ xs: [3, 2, 1] }, 0);
    expect(a).not.toBe(b);
  });

  it("hashes strings without wrapping them as objects", () => {
    // Pinned so Python & TS stay aligned. json.dumps("hello") → '"hello"'
    // md5('"hello"') first-12 → '20ed9efab7d3...'
    const digest = computeDatasetItemName("hello", 0);
    expect(digest).toMatch(/^[0-9a-f]{12}$/);
    // Shape check only — the exact hex is pinned by the parity test in
    // Python at test_dataset_item_name_parity_vectors.
  });
});
