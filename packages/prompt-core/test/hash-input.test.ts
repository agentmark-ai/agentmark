import { describe, it, expect } from "vitest";
import { hashRowInput } from "../src/hash-input";

describe("hashRowInput", () => {
  it("is deterministic for the same input", () => {
    const input = { q: "alpha", n: 1, tags: ["a", "b"] };
    expect(hashRowInput(input)).toBe(hashRowInput(input));
  });

  it("is invariant to object key order", () => {
    expect(hashRowInput({ a: 1, b: 2 })).toBe(hashRowInput({ b: 2, a: 1 }));
    expect(hashRowInput({ outer: { x: 1, y: 2 } })).toBe(
      hashRowInput({ outer: { y: 2, x: 1 } }),
    );
  });

  it("distinguishes different values, including array order", () => {
    expect(hashRowInput({ a: 1 })).not.toBe(hashRowInput({ a: 2 }));
    // Arrays are positional — reordering must change the hash.
    expect(hashRowInput(["a", "b"])).not.toBe(hashRowInput(["b", "a"]));
  });

  it("does not collide string '1' with number 1", () => {
    expect(hashRowInput({ a: 1 })).not.toBe(hashRowInput({ a: "1" }));
  });

  it("returns a stable 16-char hex string", () => {
    expect(hashRowInput({ q: "x" })).toMatch(/^[0-9a-f]{16}$/);
  });

  it("handles primitives, null, and undefined without throwing", () => {
    expect(hashRowInput("plain")).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRowInput(null)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashRowInput(undefined)).toMatch(/^[0-9a-f]{16}$/);
    // null and undefined both canonicalize to the same sentinel.
    expect(hashRowInput(undefined)).toBe(hashRowInput(null));
  });
});
