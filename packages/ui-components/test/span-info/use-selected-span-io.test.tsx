// @vitest-environment jsdom

/**
 * use-selected-span-io — lazy IO hydration of the drawer's selected span.
 *
 * Hosts that load traces "lightweight" strip the IO columns (input, output,
 * outputObject, toolCalls come back as empty strings) and provide
 * `fetchSpanIO` to fill them lazily. Consumers reading IO off the raw
 * selectedSpan see empty strings — the bug behind agentmark-ai/app#2785,
 * where the Add-to-Dataset modal captured `""` as the trace output.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { TraceDrawerProvider } from "@/sections/traces/trace-drawer/trace-drawer-provider";
import { useSelectedSpanIO } from "@/sections/traces/trace-drawer/hooks/use-selected-span-io";
import type { TraceData } from "@/sections/traces/types";

const t = (key: string) => key;

const lightweightTrace = (): TraceData[] => [
  {
    id: "trace-1",
    name: "my-agent",
    data: { latency: 1200, status: "0" },
    spans: [
      {
        id: "root-span",
        name: "invoke_agent my-agent",
        parentId: null,
        duration: 1000,
        timestamp: 0,
        data: {
          type: "SPAN",
          // Lightweight load: IO columns stripped to empty strings.
          input: "",
          output: "",
          outputObject: "",
          toolCalls: "",
          props: '{"city":"Paris"}',
        },
      },
    ],
  } as any,
];

const makeWrapper =
  (traces: TraceData[], fetchSpanIO?: (traceId: string, spanId: string) => Promise<any>) =>
  ({ children }: { children: React.ReactNode }) => (
    <TraceDrawerProvider traces={traces} traceId="trace-1" fetchSpanIO={fetchSpanIO} t={t}>
      {children}
    </TraceDrawerProvider>
  );

describe("useSelectedSpanIO", () => {
  it("hydrates the synthetic trace-root span by fetching IO for the real root span id", async () => {
    const fetchSpanIO = vi.fn().mockResolvedValue({
      input: '{"messages":[{"role":"user","content":"hi"}]}',
      output: "the real model answer",
      outputObject: "",
      toolCalls: "",
    });

    const { result } = renderHook(() => useSelectedSpanIO(), {
      wrapper: makeWrapper(lightweightTrace(), fetchSpanIO),
    });

    await waitFor(() => expect(result.current.isLoadingIO).toBe(false));

    // The selected "span" is the trace wrapper (id === traceId); the fetch
    // must target the actual root span, not the synthetic wrapper id.
    expect(fetchSpanIO).toHaveBeenCalledWith("trace-1", "root-span");
    expect(result.current.effectiveSpan?.data?.output).toBe("the real model answer");
    expect(result.current.effectiveSpan?.data?.input).toBe(
      '{"messages":[{"role":"user","content":"hi"}]}'
    );
    // Non-IO fields survive the merge.
    expect(result.current.effectiveSpan?.data?.props).toBe('{"city":"Paris"}');
  });

  it("does not fetch when the span already carries IO", async () => {
    const traces = lightweightTrace();
    (traces[0] as any).spans[0].data.output = "already here";
    const fetchSpanIO = vi.fn();

    const { result } = renderHook(() => useSelectedSpanIO(), {
      wrapper: makeWrapper(traces, fetchSpanIO),
    });

    await waitFor(() => expect(result.current.isLoadingIO).toBe(false));
    expect(fetchSpanIO).not.toHaveBeenCalled();
    expect(result.current.effectiveSpan?.data?.output).toBe("already here");
  });

  it("returns the raw span when no fetchSpanIO is provided", async () => {
    const { result } = renderHook(() => useSelectedSpanIO(), {
      wrapper: makeWrapper(lightweightTrace(), undefined),
    });

    await waitFor(() => expect(result.current.isLoadingIO).toBe(false));
    expect(result.current.effectiveSpan?.data?.output).toBe("");
  });

  it("reports loading while the fetch is in flight", async () => {
    let resolveIO!: (io: any) => void;
    const fetchSpanIO = vi.fn(
      () => new Promise<any>((resolve) => { resolveIO = resolve; })
    );

    const { result } = renderHook(() => useSelectedSpanIO(), {
      wrapper: makeWrapper(lightweightTrace(), fetchSpanIO),
    });

    await waitFor(() => expect(result.current.isLoadingIO).toBe(true));
    resolveIO({ input: "", output: "late answer", outputObject: "", toolCalls: "" });
    await waitFor(() => expect(result.current.isLoadingIO).toBe(false));
    expect(result.current.effectiveSpan?.data?.output).toBe("late answer");
  });
});
