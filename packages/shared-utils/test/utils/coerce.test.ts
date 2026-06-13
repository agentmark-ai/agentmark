import { describe, it, expect } from "vitest";
import { toNumber } from "../../src/normalizer/utils/coerce";

describe("toNumber", () => {
  it("returns finite numbers unchanged", () => {
    expect(toNumber(0)).toBe(0);
    expect(toNumber(42)).toBe(42);
    expect(toNumber(-3.5)).toBe(-3.5);
  });

  it("rejects non-finite numbers", () => {
    expect(toNumber(NaN)).toBeUndefined();
    expect(toNumber(Infinity)).toBeUndefined();
    expect(toNumber(-Infinity)).toBeUndefined();
  });

  it("parses numeric strings", () => {
    expect(toNumber("12")).toBe(12);
    expect(toNumber("0.75")).toBe(0.75);
  });

  it("rejects non-numeric strings", () => {
    expect(toNumber("abc")).toBeUndefined();
    expect(toNumber("12px")).toBeUndefined();
  });

  it("rejects booleans, objects, null and undefined", () => {
    expect(toNumber(true)).toBeUndefined();
    expect(toNumber({})).toBeUndefined();
    expect(toNumber(null)).toBeUndefined();
    expect(toNumber(undefined)).toBeUndefined();
  });
});
