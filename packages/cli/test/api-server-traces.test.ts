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

    // Verify the trace was stored in the database
    const row = db
      .prepare("SELECT * FROM traces WHERE TraceId = ?")
      .get("http-test-trace-1") as any;
    expect(row).toBeDefined();
    expect(row.SpanName).toBe("test via HTTP");
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
    expect(data.error).toContain("Invalid OTLP payload");
  });
});
