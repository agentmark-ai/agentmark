/**
 * Regression test for the `getTraceById` wire-shape translator.
 *
 * The api-server emits `TraceDetail` in the canonical flat snake_case
 * shape (`{latency_ms, duration_ms, input_tokens, …}` — see
 * `cli-src/api-server.ts` and `@agentmark-ai/api-types`), but the trace
 * drawer in `@agentmark-ai/ui-components` reads from a nested
 * `data: {...}` envelope. Without translation the drawer crashes with
 * `Cannot read properties of undefined (reading 'latency')` on the
 * very first trace the user clicks.
 *
 * These tests pin the translator against the snake_case wire that
 * the api-server actually produces. An earlier camelCase fixture
 * (latencyMs / durationMs) accidentally matched a buggy reader that
 * would never have worked against the live api-server — kept here in
 * snake_case form so the test exercises the production contract.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { type Response } from "express";
import type { Server } from "http";

let server: Server;
let port: number;
let getTraceById: (id: string) => Promise<any>;

const FLAT_DETAIL = {
  id: "trace-001",
  name: "hello-trace",
  status: "OK",
  start: "2026-05-07T10:00:00.000Z",
  end: "2026-05-07T10:00:01.234Z",
  latency_ms: 1234,
  cost: 0.0012,
  tokens: 234,
  input: "trace-level input",
  output: "trace-level output",
  spans: [
    {
      id: "span-1",
      trace_id: "trace-001",
      parent_id: null,
      name: "invoke_agent hello",
      status: "OK",
      status_message: "",
      duration_ms: 800,
      timestamp: "2026-05-07T10:00:00.100Z",
      type: "SPAN",
      model: "claude-sonnet-4",
      input_tokens: 100,
      output_tokens: 134,
      tokens: 234,
      cost: 0.0012,
      input: '[{"role":"user","content":"hi"}]',
      output: "hello there",
      output_object: null,
      tool_calls: null,
      finish_reason: "stop",
      settings: null,
      reasoning_tokens: 0,
      metadata: { region: "us-west" },
      props: '{"topic":"ai"}',
      span_kind: "INTERNAL",
      service_name: "agentmark",
      prompt_name: "hello",
    },
  ],
};

describe("getTraceById wire-shape translator", () => {
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.get("/v1/traces/:id", (req, res: Response) => {
      if (req.params.id === "missing") {
        return res.status(404).json({ path: null });
      }
      if (req.params.id === "broken") {
        return res.status(500).json({ error: "boom" });
      }
      // Always wrap in `{data: ...}` envelope to match the real api-server.
      return res.json({ data: { ...FLAT_DETAIL, id: req.params.id } });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const address = server.address();
    port = typeof address === "object" && address ? address.port : 0;
    process.env.NEXT_PUBLIC_AGENTMARK_API_PORT = String(port);

    const mod = await import("../src/lib/api/traces");
    getTraceById = mod.getTraceById;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("hoists trace-level latency/cost/tokens under `data` (drawer reads `trace.data.latency`)", async () => {
    const t = await getTraceById("trace-001");
    expect(t).not.toBeNull();
    expect(t!.data.latency).toBe(1234);
    expect(t!.data.cost).toBe(0.0012);
    expect(t!.data.tokens).toBe(234);
  });

  it("preserves trace identifiers", async () => {
    const t = await getTraceById("trace-xyz");
    expect(t!.id).toBe("trace-xyz");
    expect(t!.name).toBe("hello-trace");
  });

  it("nests span rich fields under span.data so extractSpanInput/promptName work", async () => {
    const t = await getTraceById("trace-001");
    const span = t!.spans[0];
    expect(span.id).toBe("span-1");
    expect(span.duration).toBe(800);
    expect(span.parentId).toBeUndefined();
    expect(span.data.input).toBe('[{"role":"user","content":"hi"}]');
    expect(span.data.output).toBe("hello there");
    expect(span.data.promptName).toBe("hello");
    expect(span.data.props).toBe('{"topic":"ai"}');
    expect(span.data.model).toBe("claude-sonnet-4");
  });

  it("converts ISO timestamp string to numeric (ms) for the timeline", async () => {
    const t = await getTraceById("trace-001");
    expect(typeof t!.spans[0].timestamp).toBe("number");
    expect(t!.spans[0].timestamp).toBe(Date.parse("2026-05-07T10:00:00.100Z"));
  });

  it("aggregates token totals so span.data.totalTokens is non-zero when expected", async () => {
    const t = await getTraceById("trace-001");
    expect(t!.spans[0].data.totalTokens).toBe(234);
    expect(t!.spans[0].data.inputTokens).toBe(100);
    expect(t!.spans[0].data.outputTokens).toBe(134);
  });

  it("returns null on 404", async () => {
    const t = await getTraceById("missing");
    expect(t).toBeNull();
  });

  it("returns null on server error rather than throwing", async () => {
    const t = await getTraceById("broken");
    expect(t).toBeNull();
  });
});
