import { describe, it, expect } from "vitest";
import { extractSpanTemplateProps } from "@/sections/traces/utils/extract-span-data";

describe("extractSpanTemplateProps", () => {
  it("parses JSON-string `data.props` (the canonical wire shape)", () => {
    expect(
      extractSpanTemplateProps({
        name: "invoke_agent hello",
        data: { props: '{"topic":"ai","count":3}' },
      })
    ).toEqual({ topic: "ai", count: 3 });
  });

  it("returns already-parsed object props as-is", () => {
    expect(
      extractSpanTemplateProps({
        name: "x",
        data: { props: { topic: "ai" } as never },
      })
    ).toEqual({ topic: "ai" });
  });

  it("returns null when no props field is set", () => {
    expect(
      extractSpanTemplateProps({ name: "invoke_agent x", data: {} })
    ).toBeNull();
  });

  it("returns null when props is empty string", () => {
    expect(
      extractSpanTemplateProps({ name: "x", data: { props: "" } })
    ).toBeNull();
  });

  it("returns null when props is malformed JSON", () => {
    expect(
      extractSpanTemplateProps({
        name: "x",
        data: { props: "{not json" },
      })
    ).toBeNull();
  });

  it("rejects array-shaped props (template props must be an object)", () => {
    expect(
      extractSpanTemplateProps({
        name: "x",
        data: { props: "[1,2,3]" },
      })
    ).toBeNull();
  });

  it("returns null for primitive props (string/number/null)", () => {
    expect(
      extractSpanTemplateProps({ name: "x", data: { props: '"a"' } })
    ).toBeNull();
    expect(
      extractSpanTemplateProps({ name: "x", data: { props: "42" } })
    ).toBeNull();
  });

  it("returns null for null span", () => {
    expect(extractSpanTemplateProps(null)).toBeNull();
  });

  it("returns null for span without `data`", () => {
    expect(extractSpanTemplateProps({ name: "x" })).toBeNull();
  });

  it("does NOT fall back to `input` (that's extractSpanInput's job)", () => {
    // Explicit guard: a GENERATION span has chat-message input but no
    // template props. The "Test prompt" dialog must NOT prefill the CLI
    // command with rendered messages — that was the P0 bug from manual
    // testing.
    expect(
      extractSpanTemplateProps({
        name: "ai.generateText.doGenerate",
        data: {
          type: "GENERATION",
          input: '[{"role":"user","content":"hi"}]',
          // no props
        },
      })
    ).toBeNull();
  });
});
