import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createApiServer } from "../cli-src/api-server";
import db from "../cli-src/server/database";
import type { Server } from "http";

let server: Server;
let port: number;

/**
 * Build a valid OTLP ExportTraceServiceRequest JSON payload.
 * Optionally inflate span attributes to create a large payload.
 */
function buildOtlpPayload(options?: {
  traceId?: string;
  spanId?: string;
  spanName?: string;
  /** Approximate target size in bytes for the payload */
  targetSizeBytes?: number;
}) {
  const traceId = options?.traceId || "abc123def456";
  const spanId = options?.spanId || "span001";
  const spanName = options?.spanName || "test-span";

  const attributes: Array<{ key: string; value: { stringValue: string } }> = [
    { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
    { key: "gen_ai.request.model", value: { stringValue: "gpt-4o-mini" } },
  ];

  // If a target size is requested, add a large attribute to inflate the payload
  if (options?.targetSizeBytes) {
    // Each character in the string is ~1 byte in JSON
    const paddingSize = Math.max(0, options.targetSizeBytes - 500); // subtract overhead
    const largeValue = "x".repeat(paddingSize);
    attributes.push({
      key: "gen_ai.prompt",
      value: { stringValue: largeValue },
    });
  }

  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            {
              key: "service.name",
              value: { stringValue: "test-service" },
            },
          ],
        },
        scopeSpans: [
          {
            scope: { name: "agentmark" },
            spans: [
              {
                traceId,
                spanId,
                name: spanName,
                kind: 1,
                startTimeUnixNano: "1000000000000000",
                endTimeUnixNano: "2000000000000000",
                status: { code: 1 },
                attributes,
                events: [],
                links: [],
              },
            ],
          },
        ],
      },
    ],
  };
}

describe("API Server - POST /v1/traces", () => {
  beforeAll(async () => {
    // Use a random high port to avoid conflicts
    port = 19418 + Math.floor(Math.random() * 1000);
    server = (await createApiServer(port)) as Server;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  beforeEach(() => {
    db.exec("DELETE FROM traces");
  });

  it("should accept and store a standard OTLP trace payload", async () => {
    const payload = buildOtlpPayload({
      traceId: "http-test-trace-1",
      spanId: "http-test-span-1",
      spanName: "test via HTTP",
    });

    const res = await fetch(`http://localhost:${port}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { data: { requestId: string } };
    expect(data.data).toBeDefined();
    expect(typeof data.data.requestId).toBe("string");
    expect(data.data.requestId.length).toBeGreaterThan(0);

    // Verify the trace was stored in the database
    const row = db
      .prepare("SELECT * FROM traces WHERE TraceId = ?")
      .get("http-test-trace-1") as any;
    expect(row).toBeDefined();
    expect(row.SpanName).toBe("test via HTTP");
  });

  it("should use provided x-request-id header in response", async () => {
    const payload = buildOtlpPayload({
      traceId: "reqid-test-trace-1",
      spanId: "reqid-test-span-1",
      spanName: "request id test",
    });

    const res = await fetch(`http://localhost:${port}/v1/traces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-request-id": "custom-request-id-12345",
      },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as { data: { requestId: string } };
    expect(data.data.requestId).toBe("custom-request-id-12345");
  });

  it("should accept large OTLP payloads (>100kb) with AI prompt/response data", async () => {
    // AI SDK traces commonly include full prompt text and model responses
    // in span attributes, which can easily exceed the default 100kb body limit.
    // A typical prompt with system instructions + user message + model response
    // can be 200kb+.
    const payload = buildOtlpPayload({
      traceId: "large-trace-1",
      spanId: "large-span-1",
      spanName: "large payload test",
      targetSizeBytes: 200_000, // 200kb - exceeds default 100kb limit
    });

    const body = JSON.stringify(payload);
    expect(body.length).toBeGreaterThan(100_000); // Confirm payload exceeds 100kb

    const res = await fetch(`http://localhost:${port}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    // Should succeed, not return 413 Payload Too Large
    expect(res.status).toBe(200);

    // Verify the trace was actually stored
    const row = db
      .prepare("SELECT * FROM traces WHERE TraceId = ?")
      .get("large-trace-1") as any;
    expect(row).toBeDefined();
    expect(row.SpanName).toBe("large payload test");
  });

  it("should reject invalid OTLP payloads with 400", async () => {
    const res = await fetch(`http://localhost:${port}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: "payload" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    // Canonical envelope: {error: {code, message}}.
    expect(data.error.message).toContain("Invalid OTLP payload");
    expect(data.error.code).toBe("invalid_otlp_payload");
  });
});

/**
 * End-to-end coverage for the trace-list I/O preview (issue #2899 parity).
 *
 * Boots the REAL api-server on the REAL SQLite db, seeds a trace's spans, then
 * GETs `/v1/traces` over HTTP and asserts `input_preview` / `output_preview`.
 * This exercises the whole read path the cloud already had — the bounded
 * preview SQL (`getTraceIOPreviewRows`), the shared `attachTraceIOPreviews` /
 * `deriveTraceIO` derivation, the snake_case wire mapper, and the Express
 * route — against a live server, not a mock.
 */
describe("API Server - GET /v1/traces (I/O preview)", () => {
  let previewServer: Server;
  let previewPort: number;

  beforeAll(async () => {
    previewPort = 20418 + Math.floor(Math.random() * 1000);
    previewServer = (await createApiServer(previewPort)) as Server;
  });

  afterAll(async () => {
    if (previewServer) {
      await new Promise<void>((resolve) => previewServer.close(() => resolve()));
    }
  });

  beforeEach(() => {
    db.exec("DELETE FROM traces");
  });

  // Insert one span row directly — the write/normalize path is orthogonal to
  // the preview read path under test, so seeding the table is both sufficient
  // and gives exact control over the stored Input/Output.
  const seedSpan = (s: {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    type?: string;
    timestampNs?: string;
    input?: string | null;
    output?: string | null;
  }) => {
    db.prepare(
      `INSERT INTO traces
        (TraceId, SpanId, ParentSpanId, Type, Timestamp, SpanName, StatusCode, TraceName, Input, Output, Tags)
       VALUES (?, ?, ?, ?, ?, 'invoke_agent', '1', 'Preview E2E', ?, ?, '[]')`,
    ).run(
      s.traceId,
      s.spanId,
      s.parentSpanId ?? "",
      s.type ?? "SPAN",
      s.timestampNs ?? "1700000000000000000",
      s.input ?? null,
      s.output ?? null,
    );
  };

  const listTraces = async () => {
    const res = await fetch(`http://localhost:${previewPort}/v1/traces?limit=10`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; input_preview?: string; output_preview?: string }>;
    };
    return body.data;
  };

  it("returns a truncated input/output preview per trace, root span winning over its GENERATION child", async () => {
    // >160 chars so the 160-char cut is observable end-to-end.
    const longInput = `[{"role":"user","content":"${"q".repeat(220)}"}]`;
    const longOutput = "A".repeat(220);
    seedSpan({ traceId: "preview-1", spanId: "root-1", parentSpanId: "", type: "SPAN", input: longInput, output: longOutput });
    // A GENERATION child with different I/O — must NOT win over the root span.
    seedSpan({ traceId: "preview-1", spanId: "gen-1", parentSpanId: "root-1", type: "GENERATION", input: "child in", output: "child out" });

    const row = (await listTraces()).find((t) => t.id === "preview-1");
    expect(row).toBeDefined();
    expect(row!.input_preview).toBe(longInput.slice(0, 160));
    expect(row!.output_preview).toBe(longOutput.slice(0, 160));
    // Proves truncation actually happened (the stored values are 220+ chars).
    expect(row!.input_preview!.length).toBe(160);
  });

  it("falls back to the GENERATION span's I/O when the root span carries none", async () => {
    seedSpan({ traceId: "gen-fallback", spanId: "root-2", parentSpanId: "", type: "SPAN", input: null, output: null });
    seedSpan({ traceId: "gen-fallback", spanId: "gen-2", parentSpanId: "root-2", type: "GENERATION", input: "the model input", output: "the model output" });

    const row = (await listTraces()).find((t) => t.id === "gen-fallback");
    expect(row).toBeDefined();
    expect(row!.input_preview).toBe("the model input");
    expect(row!.output_preview).toBe("the model output");
  });

  it("omits the preview fields entirely for a trace with no input/output", async () => {
    seedSpan({ traceId: "no-io", spanId: "root-3", parentSpanId: "", type: "SPAN", input: null, output: null });

    const row = (await listTraces()).find((t) => t.id === "no-io");
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("input_preview");
    expect(row).not.toHaveProperty("output_preview");
  });
});
