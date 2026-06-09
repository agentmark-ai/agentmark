import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { toFrontMatter } from "../src/serialize";

// Parse the serialized frontmatter back the way the editor does: remark-frontmatter
// strips the `---` fences and hands the inner text to `yaml.load` (js-yaml). See
// templatedx `getFrontMatter` in ast-utils.ts. A value that survives this round
// trip is one the editor can actually re-open and run.
function loadFrontMatter(mdx: string): unknown {
  const inner = mdx.replace(/^---\n/, "").replace(/---\n$/, "");
  return yaml.load(inner);
}

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

  it("renders an array of primitives as an indented block sequence", () => {
    expect(toFrontMatter({ tags: ["a", "b"] })).toBe(
      "---\ntags:\n  - a\n  - b\n---\n"
    );
  });

  it("renders an array of objects as indented dash-prefixed mappings", () => {
    expect(toFrontMatter({ items: [{ foo: 1 }, { bar: 2 }] })).toBe(
      "---\nitems:\n  - foo: 1\n  - bar: 2\n---\n"
    );
  });

  it("nests arrays under nested object keys, indented one level past the key", () => {
    expect(toFrontMatter({ cfg: { tags: ["x"] } })).toBe(
      "---\ncfg:\n  tags:\n    - x\n---\n"
    );
  });

  it("wraps an empty object as just the frontmatter fences", () => {
    expect(toFrontMatter({})).toBe("---\n---\n");
  });

  // Regression: "Add to Prompt" from a trace puts the trace's input into
  // test_settings.props. When that input is page markdown — leading `![](...)`
  // image syntax, embedded double quotes, and newlines — the old serializer
  // emitted it as a bare unquoted scalar, which js-yaml rejected with
  // `expected <block end>, but found '<scalar>'` and the editor couldn't reopen
  // the prompt. The contract is round-trip safety: load(serialize(x)) === x.
  describe("round-trips values that need YAML escaping", () => {
    const auctionMarkdown =
      '![](https://image.invaluable.com/privatelabel/tajan/wp-content/uploads/2026/03/12165927/611568_VIEW-e1773335076505-650x375.jpg "611568_VIEW")\n\n' +
      "Timed Auction\n" +
      "March 13, 2026, 2:00 PM - March 19, 2026, 2:00 PM CET\n\n" +
      "[VIEW LOTS](https://drouot.com/en/v/178021)";

    it("preserves a markdown-image prop value through a js-yaml round trip", () => {
      const input = {
        name: "auction-state-classifier",
        test_settings: { props: { page_content: auctionMarkdown } },
      };

      // Must not throw the YAMLException the editor surfaced...
      const parsed = loadFrontMatter(toFrontMatter(input));

      // ...and must reconstruct the exact object, byte-for-byte on the value.
      expect(parsed).toEqual(input);
    });

    it.each([
      ["leading tag indicator", "!reference value"],
      ["embedded double quotes", 'say "hello" to the world'],
      ["leading single quote", "'quoted"],
      ["colon-space (flow mapping ambiguity)", "key: value pairs"],
      ["leading hash (comment indicator)", "# not a comment"],
      ["trailing/leading whitespace", "  padded  "],
      ["multiline with blank lines", "line one\n\nline three"],
      ["leading ampersand (anchor)", "&anchor text"],
      ["leading asterisk (alias)", "*alias text"],
    ])("round-trips a value with %s", (_label, value) => {
      const input = { test_settings: { props: { v: value } } };
      expect(loadFrontMatter(toFrontMatter(input))).toEqual(input);
    });
  });

  // The emit options are deliberate, so pin each one's observable effect.
  describe("emit options keep prompt files readable and safe", () => {
    it("keeps long scalars on one line instead of folding them (lineWidth)", () => {
      const note =
        "this is a long sentence with many words that exceeds the default eighty character line width limit by a wide margin indeed";
      const out = toFrontMatter({ note });

      // Folding (the default 80-col behaviour) would emit `note: >-` and split
      // the sentence across continuation lines.
      expect(out).toContain(`note: ${note}\n`);
      expect(out).not.toContain(">-");
    });

    it("expands shared object references instead of emitting anchors (noRefs)", () => {
      const shared = { city: "Paris" };
      const out = toFrontMatter({ origin: shared, destination: shared });

      // An anchor/alias pair (`&ref_0` / `*ref_0`) would be valid YAML but
      // surprising in a hand-edited prompt file.
      expect(out).not.toMatch(/[&*]ref/);
      expect(loadFrontMatter(out)).toEqual({
        origin: { city: "Paris" },
        destination: { city: "Paris" },
      });
    });

    it("drops non-representable values rather than throwing (skipInvalid)", () => {
      // A function has no YAML representation; without skipInvalid, js-yaml.dump
      // throws and the whole save fails. The serializer must drop the key and
      // emit the rest.
      const input: Record<string, unknown> = { kept: "yes", fn: () => "nope" };

      let out = "";
      expect(() => {
        out = toFrontMatter(input);
      }).not.toThrow();
      expect(loadFrontMatter(out)).toEqual({ kept: "yes" });
    });
  });
});
