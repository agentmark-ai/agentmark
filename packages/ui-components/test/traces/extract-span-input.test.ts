import { describe, it, expect } from "vitest";
import {
  extractSpanInput,
  getSpanInputKind,
} from "@/sections/traces/utils/extract-span-data";

// A GENERATION span as emitted for a templated prompt run: it carries BOTH the
// template variables (`props`) and the rendered chat messages (`input`). The
// dataset row must capture the *variables* — that's the re-runnable input every
// prompt-as-code eval tool stores (Promptfoo `vars`, Braintrust/LangSmith
// template inputs), and what `run-experiment` feeds back as props. Rendered
// messages can't re-render the template, so they are a derived form.
const renderedMessages =
  '[{"role":"system","content":"You are a router."},{"role":"user","content":"refund me"}]';

describe("extractSpanInput — prefers template variables over rendered messages", () => {
  it("returns props (not messages) for a GENERATION span that has both", () => {
    // Regression guard: the bug was that GENERATION spans fell through to the
    // messages branch, so "Add to dataset" captured `{messages:[...]}` instead
    // of the variables sitting right on the span.
    expect(
      extractSpanInput({
        name: "support-triage",
        data: {
          type: "GENERATION",
          props: '{"ticket":"refund me"}',
          input: renderedMessages,
        },
      }),
    ).toEqual({ ticket: "refund me" });
  });

  it("accepts already-parsed object props", () => {
    expect(
      extractSpanInput({
        name: "support-triage",
        data: {
          type: "GENERATION",
          props: { ticket: "refund me" } as never,
          input: renderedMessages,
        },
      }),
    ).toEqual({ ticket: "refund me" });
  });

  it("falls back to messages when the span carries no props (raw chat call)", () => {
    expect(
      extractSpanInput({
        name: "chat",
        data: {
          type: "GENERATION",
          input: '[{"role":"user","content":"hi"}]',
        },
      }),
    ).toEqual({ messages: [{ role: "user", content: "hi" }] });
  });

  it("treats empty props {} as absent and falls back to messages", () => {
    expect(
      extractSpanInput({
        name: "support-triage",
        data: { type: "GENERATION", props: "{}", input: renderedMessages },
      }),
    ).toEqual({
      messages: [
        { role: "system", content: "You are a router." },
        { role: "user", content: "refund me" },
      ],
    });
  });

  it("still resolves props for invoke_agent spans (backward compatible)", () => {
    expect(
      extractSpanInput({
        name: "invoke_agent hello",
        data: { props: '{"topic":"ai"}' },
      }),
    ).toEqual({ topic: "ai" });
  });

  it("uses tool-call arguments for a tool span with no props", () => {
    expect(
      extractSpanInput({
        name: "execute_tool",
        data: { toolCalls: '[{"args":{"query":"x"}}]' },
      }),
    ).toEqual({ query: "x" });
  });

  it("unwraps synthetic single-user content for a non-GENERATION span", () => {
    expect(
      extractSpanInput({
        name: "myFunction",
        data: { type: "FUNCTION", input: '[{"role":"user","content":"{\\"a\\":1}"}]' },
      }),
    ).toEqual({ a: 1 });
  });

  it("returns null for a null span or a span without data", () => {
    expect(extractSpanInput(null)).toBeNull();
    expect(extractSpanInput({ name: "x" })).toBeNull();
  });
});

describe("getSpanInputKind — label mirrors extractSpanInput", () => {
  it('reports "props" when usable variables are present, even with messages', () => {
    expect(
      getSpanInputKind({
        name: "support-triage",
        data: { type: "GENERATION", props: '{"ticket":"x"}', input: renderedMessages },
      }),
    ).toBe("props");
  });

  it('reports "messages" for a chat span with no props', () => {
    expect(
      getSpanInputKind({
        name: "chat",
        data: { type: "GENERATION", input: '[{"role":"user","content":"hi"}]' },
      }),
    ).toBe("messages");
  });

  it('reports "messages" (not "props") when props is the empty object', () => {
    expect(
      getSpanInputKind({
        name: "support-triage",
        data: { type: "GENERATION", props: "{}", input: renderedMessages },
      }),
    ).toBe("messages");
  });

  it('reports "tool call" for a tool span', () => {
    expect(
      getSpanInputKind({ name: "execute_tool", data: { toolCalls: '[{"args":{}}]' } }),
    ).toBe("tool call");
  });

  it('reports "IO" for non-message function input', () => {
    expect(
      getSpanInputKind({ name: "fn", data: { input: '{"a":1}' } }),
    ).toBe("IO");
  });

  it("returns null for a null span", () => {
    expect(getSpanInputKind(null)).toBeNull();
  });
});
