import { describe, it, expect } from "vitest";
import { toFrontMatter } from "../src/serialize";

describe("toFrontMatter", () => {
  it("serializes flat primitive values", () => {
    expect(toFrontMatter({ name: "agentmark", count: 5, enabled: true })).toBe(
      "---\nname: agentmark\ncount: 5\nenabled: true\n---\n"
    );
  });

  it("indents nested objects by two spaces per level", () => {
    expect(toFrontMatter({ outer: { inner: { leaf: "v" } } })).toBe(
      "---\nouter:\n  inner:\n    leaf: v\n---\n"
    );
  });

  it("renders an array of primitives as a dashed list at the parent indent", () => {
    expect(toFrontMatter({ tags: ["a", "b"] })).toBe(
      "---\ntags:\n- a\n- b\n---\n"
    );
  });

  it("renders an array of objects with a bare dash then the object indented two levels deeper", () => {
    // Array-of-object items recurse at indent + 2, i.e. four spaces under the key.
    expect(toFrontMatter({ items: [{ x: 1 }, { y: 2 }] })).toBe(
      "---\nitems:\n-\n    x: 1\n-\n    y: 2\n---\n"
    );
  });

  it("nests arrays under nested object keys with the parent's indentation", () => {
    expect(toFrontMatter({ cfg: { tags: ["x"] } })).toBe(
      "---\ncfg:\n  tags:\n  - x\n---\n"
    );
  });

  it("wraps an empty object as just the frontmatter fences", () => {
    expect(toFrontMatter({})).toBe("---\n---\n");
  });
});
