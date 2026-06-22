// @vitest-environment jsdom

/**
 * OutputDisplay dispatch — the seam between extracted output data and which
 * renderer is used. Retrieval spans (documents present) must route to the
 * ranked RetrievalDocuments panel; everything else falls through to the
 * generic OutputAccordion.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { OutputDisplay } from "@/sections/traces/trace-drawer/span-info/tabs/input-output-tab/output-display";
import { TraceDrawerProvider } from "@/sections/traces/trace-drawer/trace-drawer-provider";

const t = (key: string) => key;
// The generic OutputAccordion reads `t` from context; the documents panel does not.
const withProvider = (ui: React.ReactNode) =>
  render(
    <TraceDrawerProvider traces={[]} traceId="t" t={t}>
      {ui}
    </TraceDrawerProvider>,
  );

describe("OutputDisplay dispatch", () => {
  it("routes to the RetrievalDocuments panel when documents are present", () => {
    render(
      <OutputDisplay
        outputData={{
          documents: [
            { id: "a", content: "x", score: 0.9 },
            { id: "b", distance: 0.1 },
          ],
        }}
      />,
    );
    expect(screen.getByText("Retrieved Documents (2)")).toBeTruthy();
  });

  it("routes to the generic output (NOT the panel) when there are no documents", () => {
    withProvider(<OutputDisplay outputData={{ text: "plain answer" }} />);
    expect(screen.getByText("plain answer")).toBeTruthy();
    expect(screen.queryByText(/Retrieved Documents/)).toBeNull();
  });

  it("does not treat an empty documents array as a retrieval panel (length guard)", () => {
    withProvider(<OutputDisplay outputData={{ documents: [], text: "fallback text" }} />);
    expect(screen.queryByText(/Retrieved Documents/)).toBeNull();
    expect(screen.getByText("fallback text")).toBeTruthy();
  });

  it("renders nothing when outputData is null", () => {
    const { container } = render(<OutputDisplay outputData={null} />);
    expect(container.firstChild).toBeNull();
  });

  // The bug this guards: an offloaded image/large-text output has only an 8KB
  // truncated preview inline. Rendering it here dumped a clipped, unreadable
  // base64 wall above the real image (rendered by OffloadedFields). When the
  // field is offloaded we must suppress the preview entirely.
  it("suppresses the truncated preview when the Output field is offloaded", () => {
    const { container } = withProvider(
      <OutputDisplay
        outputData={{ text: '[{"mimeType":"image/png","base64":"iVBORtruncat' }}
        offloadedFields={new Set(["Output"])}
      />,
    );
    // No base64 wall, and no empty "No output" bubble — render nothing here.
    expect(screen.queryByText(/iVBORtruncat/)).toBeNull();
    expect(screen.queryByText("noOutput")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  it("still renders a non-offloaded field alongside an offloaded one", () => {
    // Output offloaded (suppressed) but a tool call present inline → tool call shows.
    withProvider(
      <OutputDisplay
        outputData={{
          text: "truncated-preview",
          toolCall: { toolName: "search", args: { q: "hi" } },
        }}
        offloadedFields={new Set(["Output"])}
      />,
    );
    expect(screen.queryByText(/truncated-preview/)).toBeNull();
    expect(screen.getByText(/search/)).toBeTruthy();
  });

  it("renders the preview normally when nothing is offloaded", () => {
    withProvider(<OutputDisplay outputData={{ text: "normal answer" }} offloadedFields={new Set()} />);
    expect(screen.getByText("normal answer")).toBeTruthy();
  });
});
