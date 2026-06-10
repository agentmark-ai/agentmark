import { describe, it, expect } from "vitest";
import { mapRawTraceToDetail } from "../cli-src/server/services/helpers";
import { toTraceDetailWire } from "../cli-src/server/wire-mappers";

/**
 * Regression test for trace-level input/output on `GET /v1/traces/:id`.
 *
 * The local route maps getTraceById → mapRawTraceToDetail → toTraceDetailWire.
 * getTraceById's SQL never aggregates Input/Output, so mapRawTraceToDetail
 * must derive them the same way the cloud gateway's transformTraceDetail
 * does: first GENERATION span's input, last GENERATION span's output, in
 * timestamp order. Before this derivation existed, the wire response never
 * carried trace-level `input`/`output`, so `doctor --smoke`'s traceShape
 * check (`trace.input == null` / `trace.output == null`) could never pass
 * against the local dev server.
 */

/** Raw span in the shape getTraceById produces ({ id, name, ..., data }). */
function rawSpan(opts: {
  id: string;
  parentId?: string | null;
  name: string;
  timestamp: number;
  type?: string;
  input?: string;
  output?: string;
  model?: string;
}) {
  return {
    id: opts.id,
    traceId: "trace-1",
    parentId: opts.parentId ?? null,
    name: opts.name,
    duration: 100,
    timestamp: opts.timestamp,
    status: "1",
    data: {
      type: opts.type ?? "SPAN",
      input: opts.input,
      output: opts.output,
      model: opts.model,
    },
  };
}

function rawTrace(spans: Array<Record<string, unknown>>) {
  return {
    id: "trace-1",
    name: "my-prompt",
    spans,
    data: {
      id: "trace-1",
      name: "my-prompt",
      status: "1",
      latency: 1234,
      cost: 0.001,
      tokens: 42,
      start: 1_700_000_000_000,
      end: 1_700_000_001_234,
    },
  };
}

describe("mapRawTraceToDetail trace-level input/output", () => {
  it("derives input from the first GENERATION span and output from the last", () => {
    const detail = mapRawTraceToDetail(
      rawTrace([
        rawSpan({ id: "root", name: "my-prompt", timestamp: 1 }),
        rawSpan({
          id: "gen-1",
          parentId: "root",
          name: "chat claude-sonnet-4-6",
          timestamp: 2,
          type: "GENERATION",
          input: '[{"role":"user","content":"first"}]',
          output: "intermediate",
          model: "claude-sonnet-4-6",
        }),
        rawSpan({
          id: "gen-2",
          parentId: "root",
          name: "chat claude-sonnet-4-6",
          timestamp: 3,
          type: "GENERATION",
          input: '[{"role":"user","content":"second"}]',
          output: '{"answer":42}',
          model: "claude-sonnet-4-6",
        }),
      ])
    );

    expect(detail.input).toBe('[{"role":"user","content":"first"}]');
    expect(detail.output).toBe('{"answer":42}');
  });

  it("prefers the root span's I/O (runner-recorded agentmark.input/output) over GENERATION spans", () => {
    const detail = mapRawTraceToDetail(
      rawTrace([
        rawSpan({
          id: "root",
          name: "my-prompt",
          timestamp: 1,
          input: '[{"role":"user","content":"the real request"}]',
          output: '{"the":"real answer"}',
        }),
        rawSpan({
          id: "gen-1",
          parentId: "root",
          name: "chat claude-sonnet-4-6",
          timestamp: 2,
          type: "GENERATION",
          input: "model-view-input",
          output: "model-view-output",
          model: "claude-sonnet-4-6",
        }),
      ])
    );

    expect(detail.input).toBe('[{"role":"user","content":"the real request"}]');
    expect(detail.output).toBe('{"the":"real answer"}');
  });

  it("omits input/output when no GENERATION span exists", () => {
    const detail = mapRawTraceToDetail(
      rawTrace([rawSpan({ id: "root", name: "my-prompt", timestamp: 1 })])
    );

    expect(detail.input).toBeUndefined();
    expect(detail.output).toBeUndefined();
  });

  it("round-trips through toTraceDetailWire so the wire carries trace I/O", () => {
    const wire = toTraceDetailWire(
      mapRawTraceToDetail(
        rawTrace([
          rawSpan({ id: "root", name: "my-prompt", timestamp: 1 }),
          rawSpan({
            id: "gen-1",
            parentId: "root",
            name: "chat claude-sonnet-4-6",
            timestamp: 2,
            type: "GENERATION",
            input: '[{"role":"user","content":"hi"}]',
            output: "hello",
            model: "claude-sonnet-4-6",
          }),
        ])
      )
    );

    // doctor --smoke's traceShape check reads exactly these two keys.
    expect(wire.input).toBe('[{"role":"user","content":"hi"}]');
    expect(wire.output).toBe("hello");
  });
});
