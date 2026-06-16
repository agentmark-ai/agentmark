// @vitest-environment jsdom

/**
 * RetrievalDocuments — the ranked retrieved-documents panel for retrieval /
 * vector-store spans. Locks the behavior that distinguishes it from the old
 * "join everything into one blob" rendering: per-document rank, id, relevance
 * score OR vector distance, content, and metadata.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RetrievalDocuments,
  RetrievalDocumentView,
} from "@/sections/traces/trace-drawer/span-info/tabs/input-output-tab/retrieval-documents";

describe("RetrievalDocuments", () => {
  it("renders a count header and one entry per document with score/distance + id", () => {
    const documents: RetrievalDocumentView[] = [
      { id: "vec-1", content: "first chunk", score: 0.9123 },
      { id: "vec-2", content: "second chunk", distance: 0.2 },
    ];
    render(<RetrievalDocuments documents={documents} />);

    expect(screen.getByText("Retrieved Documents (2)")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.getByText("vec-1")).toBeTruthy();
    expect(screen.getByText("vec-2")).toBeTruthy();
    // score trimmed to 4 decimals, no trailing zeros; distance distinct from score
    expect(screen.getByText("score 0.9123")).toBeTruthy();
    expect(screen.getByText("distance 0.2")).toBeTruthy();
    expect(screen.getByText("first chunk")).toBeTruthy();
  });

  it("renders metadata when present", () => {
    render(
      <RetrievalDocuments
        documents={[{ id: "d", content: "c", metadata: { source: "kb.md" } }]}
      />,
    );
    expect(screen.getByText("Metadata")).toBeTruthy();
    // the JSON metadata block contains the source key
    expect(screen.getByText(/kb\.md/)).toBeTruthy();
  });

  it("renders nothing for an empty document set", () => {
    const { container } = render(<RetrievalDocuments documents={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
