// @vitest-environment jsdom

/**
 * Regression: useSpanPrompts must surface `blobRefs` from the EFFECTIVE
 * (lazily-IO-hydrated) span, not the raw selectedSpan.
 *
 * The raw selectedSpan carries no blobRefs under a lightweight trace load — it
 * only arrives via the lazy `fetchSpanIO` merge (same path as input/output).
 * The InputOutputTab reads `blobRefs` from this hook to decide whether to render
 * <OffloadedOutput>, so if the hook reads the raw span the offloaded image/audio
 * never renders (the bug found in local testing of the multimodal feature).
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { TraceDrawerProvider } from "@/sections/traces/trace-drawer/trace-drawer-provider";
import { useSpanPrompts } from "@/sections/traces/trace-drawer/span-info/tabs/hooks/use-span-prompts";
import type { TraceData } from "@/sections/traces/types";

const t = (key: string) => key;

// Lightweight trace: IO columns stripped to empty strings (hydrated lazily).
const lightweightTrace = (): TraceData[] => [
  {
    id: "trace-1",
    name: "image-generation",
    data: { latency: 10, status: "0" },
    spans: [
      {
        id: "root-span",
        name: "image-generation",
        parentId: null,
        duration: 5,
        timestamp: 0,
        data: {
          type: "GENERATION",
          model: "dall-e-3",
          input: "",
          output: "",
          outputObject: "",
          toolCalls: "",
        },
      },
    ],
  } as any,
];

const BLOB_REFS =
  '[{"field":"Output","blob_id":"tnt/app/trace-1/root-span/Output","size":102753}]';

const wrapper =
  (fetchSpanIO: (traceId: string, spanId: string) => Promise<any>) =>
  ({ children }: { children: React.ReactNode }) => (
    <TraceDrawerProvider traces={lightweightTrace()} traceId="trace-1" fetchSpanIO={fetchSpanIO} t={t}>
      {children}
    </TraceDrawerProvider>
  );

describe("useSpanPrompts — blobRefs surfacing", () => {
  it("returns blobRefs from the lazily-hydrated IO", async () => {
    const fetchSpanIO = vi.fn().mockResolvedValue({
      input: '[{"role":"user","content":"a picture of a cat"}]',
      output: '[{"mimeType":"image/png","base64":"iVBORw0=="}]',
      outputObject: null,
      toolCalls: null,
      blobRefs: BLOB_REFS,
    });

    const { result } = renderHook(() => useSpanPrompts(), { wrapper: wrapper(fetchSpanIO) });

    // Before the lazy fetch resolves, there is nothing to render.
    await waitFor(() => expect(result.current.blobRefs).toBe(BLOB_REFS));
    expect(fetchSpanIO).toHaveBeenCalled();
  });

  it("leaves blobRefs undefined when the span has no offloaded fields", async () => {
    const fetchSpanIO = vi.fn().mockResolvedValue({
      input: '[{"role":"user","content":"hi"}]',
      output: "a short answer",
      outputObject: null,
      toolCalls: null,
      // no blobRefs
    });

    const { result } = renderHook(() => useSpanPrompts(), { wrapper: wrapper(fetchSpanIO) });

    await waitFor(() => expect(result.current.outputData?.text).toBe("a short answer"));
    expect(result.current.blobRefs).toBeUndefined();
  });
});
