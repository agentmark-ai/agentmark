import { describe, it, expect } from "vitest";
import { tracePreviewLines } from "@/sections/traces/trace-list/trace-list-item";

/**
 * Pins the pure selection logic behind the trace-list I/O preview: which lines
 * render, in what order, with which muted color. Kept out of the DOM so the
 * contract is asserted directly.
 */
describe("tracePreviewLines", () => {
  it("returns input then output, each with its muted color token", () => {
    expect(
      tracePreviewLines({
        input_preview: "the question",
        output_preview: "the answer",
      }),
    ).toEqual([
      { kind: "input", text: "the question", color: "text.secondary" },
      { kind: "output", text: "the answer", color: "text.disabled" },
    ]);
  });

  it("includes only the input line when output is absent", () => {
    expect(tracePreviewLines({ input_preview: "just input" })).toEqual([
      { kind: "input", text: "just input", color: "text.secondary" },
    ]);
  });

  it("includes only the output line when input is absent", () => {
    expect(tracePreviewLines({ output_preview: "just output" })).toEqual([
      { kind: "output", text: "just output", color: "text.disabled" },
    ]);
  });

  it("returns no lines when neither preview is present (row shows nothing)", () => {
    expect(tracePreviewLines({})).toEqual([]);
    expect(
      tracePreviewLines({ input_preview: null, output_preview: null }),
    ).toEqual([]);
  });

  it("treats an empty-string preview as absent (no blank line rendered)", () => {
    expect(
      tracePreviewLines({ input_preview: "", output_preview: "" }),
    ).toEqual([]);
  });
});
