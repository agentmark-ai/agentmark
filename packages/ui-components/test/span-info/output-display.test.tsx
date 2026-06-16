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
});
