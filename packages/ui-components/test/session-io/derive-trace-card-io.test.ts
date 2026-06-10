import { describe, it, expect } from "vitest";
import { deriveTraceCardIO } from "@/sections/traces/trace-drawer/session-io/derive-trace-card-io";

// Node factories mirror the provider's spanTree shape: a trace wrapper whose
// `data` is the merged root-span data and whose `children` are the root spans
// (each with nested children).
const generation = (
  id: string,
  timestamp: number,
  data: Record<string, any>,
  children: any[] = []
) => ({
  id,
  name: "chat",
  timestamp,
  children,
  data: { type: "GENERATION", model: "claude", ...data },
});

const plainSpan = (id: string, timestamp: number, data: Record<string, any>) => ({
  id,
  // claude.* names are excluded from the tool-span heuristic, which keeps
  // these spans out of BOTH the generation filter and tool extraction —
  // the case the fallback must skip entirely.
  name: `claude.${id}`,
  timestamp,
  children: [],
  data: { type: "SPAN", ...data },
});

const wrapperNode = (data: Record<string, any>, children: any[]) => ({
  id: "trace-1",
  name: "my-trace",
  data,
  children,
});

const INPUT_MESSAGES = [{ role: "user", content: "rootInput" }];

describe("deriveTraceCardIO", () => {
  it("uses the wrapper (root span) IO when both fields are present — generations never override", () => {
    const node = wrapperNode(
      { input: JSON.stringify(INPUT_MESSAGES), output: "rootOutput" },
      [
        generation("g1", 1, {
          input: JSON.stringify([{ role: "user", content: "genInput" }]),
          output: "genOutput",
        }),
      ]
    );

    expect(deriveTraceCardIO(node)).toEqual({
      prompts: [{ role: "user", content: "rootInput" }],
      outputData: {
        text: "rootOutput",
        toolCalls: undefined,
        toolCall: null,
        objectResponse: null,
      },
    });
  });

  it("falls back to first-generation input and LAST-generation output when the root has neither", () => {
    const node = wrapperNode({}, [
      generation("g1", 10, {
        input: JSON.stringify([{ role: "user", content: "firstGenInput" }]),
        output: "firstGenOutput",
      }),
      generation("g2", 20, {
        input: JSON.stringify([{ role: "user", content: "lastGenInput" }]),
        output: "lastGenOutput",
      }),
    ]);

    expect(deriveTraceCardIO(node)).toEqual({
      prompts: [{ role: "user", content: "firstGenInput" }],
      outputData: {
        text: "lastGenOutput",
        toolCalls: undefined,
        toolCall: null,
        objectResponse: null,
      },
    });
  });

  it("resolves each field independently (root input kept, output from generations)", () => {
    const node = wrapperNode({ input: JSON.stringify(INPUT_MESSAGES) }, [
      generation("g1", 1, {
        input: JSON.stringify([{ role: "user", content: "genInput" }]),
        output: "genOutput",
      }),
    ]);

    expect(deriveTraceCardIO(node)).toEqual({
      prompts: [{ role: "user", content: "rootInput" }],
      outputData: {
        text: "genOutput",
        toolCalls: undefined,
        toolCall: null,
        objectResponse: null,
      },
    });
  });

  it("orders generations by timestamp, not tree position, and skips empty values", () => {
    const node = wrapperNode({}, [
      // Listed out of order; g-late carries the only late output, g-early the
      // only input. An empty-string input/output must not satisfy a field.
      generation("g-late", 30, { input: "", output: "lateOutput" }),
      generation("g-mid", 20, { output: "" }),
      generation("g-early", 10, {
        input: JSON.stringify([{ role: "user", content: "earlyInput" }]),
      }),
    ]);

    expect(deriveTraceCardIO(node)).toEqual({
      prompts: [{ role: "user", content: "earlyInput" }],
      outputData: {
        text: "lateOutput",
        toolCalls: undefined,
        toolCall: null,
        objectResponse: null,
      },
    });
  });

  it("walks nested children, ignores non-generation spans, and yields empty IO when nothing qualifies", () => {
    const nested = wrapperNode({}, [
      plainSpan("wrapper-span", 1, {
        output: "nonGenerationOutput",
      }),
      generation("outer", 5, {}, [
        generation("inner", 6, {
          input: JSON.stringify([{ role: "user", content: "nestedInput" }]),
          output: "nestedOutput",
        }),
      ]),
    ]);

    expect(deriveTraceCardIO(nested)).toEqual({
      prompts: [{ role: "user", content: "nestedInput" }],
      outputData: {
        text: "nestedOutput",
        toolCalls: undefined,
        toolCall: null,
        objectResponse: null,
      },
    });

    const barren = wrapperNode({}, [
      plainSpan("s1", 1, { output: "nonGenerationOutput" }),
    ]);
    expect(deriveTraceCardIO(barren)).toEqual({
      prompts: [],
      outputData: null,
    });
  });
});
