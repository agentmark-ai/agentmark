import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  computeDatasetItemName,
  canonicalJsonStringify,
} from "../src/dataset-item-name";

/** Reference MD5 implementation for cross-checking expected outputs. */
function md5Hex12(input: string): string {
  return createHash("md5").update(input).digest("hex").slice(0, 12);
}

describe("canonicalJsonStringify", () => {
  it("emits primitives like JSON.stringify", () => {
    expect(canonicalJsonStringify("hello")).toBe('"hello"');
    expect(canonicalJsonStringify(42)).toBe("42");
    expect(canonicalJsonStringify(true)).toBe("true");
    expect(canonicalJsonStringify(false)).toBe("false");
    expect(canonicalJsonStringify(null)).toBe("null");
  });

  it("sorts object keys lexicographically at the top level", () => {
    expect(canonicalJsonStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("sorts keys recursively at every level of nesting", () => {
    const out = canonicalJsonStringify({
      z: { y: 1, x: 2 },
      a: { d: 3, c: 4 },
    });
    expect(out).toBe('{"a":{"c":4,"d":3},"z":{"x":2,"y":1}}');
  });

  it("preserves array order (arrays are positional, not bags)", () => {
    expect(canonicalJsonStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("recursively canonicalises objects nested inside arrays", () => {
    expect(canonicalJsonStringify([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  it("stringifies non-serializable values (matches Python's default=str)", () => {
    // BigInt: JSON.stringify would throw; canonicalize coerces to string.
    expect(canonicalJsonStringify(BigInt(10))).toBe('"10"');
    // Function: same — string representation.
    const fn = function foo() {};
    const out = canonicalJsonStringify(fn);
    expect(out.startsWith('"')).toBe(true);
    expect(out).toContain("function");
  });

  it("treats `undefined` as a string fallback (Python default=str parity)", () => {
    expect(canonicalJsonStringify(undefined)).toBe('"undefined"');
  });

  it("produces identical output regardless of input key ordering", () => {
    const a = canonicalJsonStringify({ foo: 1, bar: 2, baz: 3 });
    const b = canonicalJsonStringify({ baz: 3, bar: 2, foo: 1 });
    expect(a).toBe(b);
  });
});

describe("computeDatasetItemName", () => {
  it("returns a 12-char hex string for non-null input", () => {
    const name = computeDatasetItemName({ q: "hello" }, 0);
    expect(name).toMatch(/^[0-9a-f]{12}$/);
  });

  it("falls back to String(index) when input is null", () => {
    expect(computeDatasetItemName(null, 42)).toBe("42");
  });

  it("falls back to String(index) when input is undefined", () => {
    expect(computeDatasetItemName(undefined, 7)).toBe("7");
  });

  it("produces the same name for the same input regardless of index", () => {
    const a = computeDatasetItemName({ q: "hello" }, 0);
    const b = computeDatasetItemName({ q: "hello" }, 99);
    expect(a).toBe(b);
  });

  it("produces the same name for two inputs that differ only in key order", () => {
    const a = computeDatasetItemName({ q: "hello", lang: "fr" }, 0);
    const b = computeDatasetItemName({ lang: "fr", q: "hello" }, 0);
    expect(a).toBe(b);
  });

  it("produces a different name when the input content changes", () => {
    const a = computeDatasetItemName({ q: "hello" }, 0);
    const b = computeDatasetItemName({ q: "world" }, 0);
    expect(a).not.toBe(b);
  });

  it("produces a different name when array order changes (arrays are positional)", () => {
    const a = computeDatasetItemName({ tags: ["a", "b"] }, 0);
    const b = computeDatasetItemName({ tags: ["b", "a"] }, 0);
    expect(a).not.toBe(b);
  });

  it("matches the MD5-of-canonical-JSON formula exactly", () => {
    const input = { q: "hello", lang: "fr" };
    const expected = md5Hex12('{"lang":"fr","q":"hello"}');
    expect(computeDatasetItemName(input, 0)).toBe(expected);
  });

  it("handles primitive inputs (string, number, boolean)", () => {
    expect(computeDatasetItemName("hello", 0)).toMatch(/^[0-9a-f]{12}$/);
    expect(computeDatasetItemName(42, 0)).toMatch(/^[0-9a-f]{12}$/);
    expect(computeDatasetItemName(true, 0)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("survives row reordering — same input, different position, same name", () => {
    // Simulate a dataset reorder: row that was at index 3 is now at index 0.
    const row = { user: "alice", q: "what time is it?" };
    const nameAtPos3 = computeDatasetItemName(row, 3);
    const nameAtPos0 = computeDatasetItemName(row, 0);
    expect(nameAtPos3).toBe(nameAtPos0);
  });

  it("matches Python implementation's hex-prefix length (12 chars)", () => {
    // The pydantic-ai adapter slices `.hexdigest()[:12]`; this test pins
    // our TS implementation to the same prefix length so cross-runtime
    // comparisons line up.
    const name = computeDatasetItemName({ q: "x" }, 0);
    expect(name).toHaveLength(12);
  });
});
