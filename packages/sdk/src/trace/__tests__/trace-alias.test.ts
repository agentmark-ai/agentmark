import { describe, it, expect } from "vitest";
import { trace, span } from "../index";

/**
 * `trace` is an alias for `span`, added for parity with the Python SDK's
 * `trace()` and to remove the confusion that shipped a (now-deleted) dev script
 * importing a non-existent `trace`. Pin the alias identity so it can't drift.
 */
describe("trace alias", () => {
  it("is re-exported from the trace barrel and is the exact same function as span", () => {
    expect(typeof trace).toBe("function");
    expect(trace).toBe(span);
  });
});
