import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { trace } from "../trace/tracing";
import { AgentMarkSDK } from "../agentmark";
import * as api from "@opentelemetry/api";

interface OTLPRequest {
  resourceSpans: Array<{
    resource: {
      attributes: Array<{ key: string; value: { stringValue?: string } }>;
    };
    scopeSpans: Array<{
      scope: { name?: string };
      spans: Array<{
        name: string;
        traceId: string;
        spanId: string;
        parentSpanId?: string;
        attributes: Array<{ key: string; value: { stringValue?: string; intValue?: number } }>;
        events?: Array<{
          name: string;
          timeUnixNano: string;
          attributes?: Array<{ key: string; value: { stringValue?: string } }>;
        }>;
        links?: Array<{
          traceId: string;
          spanId: string;
        }>;
        status?: { code: number };
      }>;
    }>;
  }>;
}

describe("OTLP Exporter", () => {
  let server: Server;
  let serverUrl: string;
  let receivedRequests: Array<{ body: OTLPRequest; headers: Record<string, string | string[] | undefined> }>;
  let sdk: AgentMarkSDK;
  let activeSdk: any;

  async function flushSpans() {
    const provider = api.trace.getTracerProvider() as any;
    if (provider.forceFlush) {
      await provider.forceFlush();
    }
    // Give more time for the HTTP request to complete (longer for Windows)
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  function findSpanByName(spanName: string): {
    span: OTLPRequest["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    attrMap: Map<string, string | undefined>;
  } | null {
    // Search through all requests in reverse order (most recent first)
    for (let i = receivedRequests.length - 1; i >= 0; i--) {
      const request = receivedRequests[i];
      for (const resourceSpan of request.body.resourceSpans) {
        for (const scopeSpan of resourceSpan.scopeSpans) {
          for (const span of scopeSpan.spans) {
            // Check if this is the span we're looking for by name
            if (span.name === spanName) {
              const attrMap = new Map(
                span.attributes.map((attr) => [attr.key, attr.value.stringValue])
              );
              return { span, attrMap };
            }
            // Also check trace_name attribute as fallback
            const traceNameAttr = span.attributes.find(
              (attr) => attr.key === "agentmark.trace_name"
            );
            if (traceNameAttr?.value.stringValue === spanName) {
              const attrMap = new Map(
                span.attributes.map((attr) => [attr.key, attr.value.stringValue])
              );
              return { span, attrMap };
            }
          }
        }
      }
    }
    return null;
  }

  beforeAll(async () => {
    // Create a single server for all tests
    receivedRequests = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body) as OTLPRequest;
          receivedRequests.push({
            body: parsed,
            headers: req.headers,
          });
          res.writeHead(200);
          res.end();
        } catch (e) {
          console.error("Error parsing request:", e, body.substring(0, 200));
          res.writeHead(400);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      // Use 127.0.0.1 explicitly to avoid IPv4/IPv6 mismatch on Windows
      // (localhost can resolve to ::1 on Windows while server binds to 127.0.0.1)
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        sdk = new AgentMarkSDK({
          apiKey: "test-api-key",
          appId: "test-app-id",
          baseUrl: serverUrl,
        });
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Shutdown SDK and close server once after all tests
    if (activeSdk) {
      await activeSdk.shutdown();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  it("should test all OTLP exporter functionality including utility functions and context parameters", { timeout: 30000 }, async () => {
    // Initialize tracing once for the entire test
    activeSdk = sdk.initTracing({ disableBatch: true });

    // Allow time for SDK to fully initialize (needed on Windows)
    await new Promise((resolve) => setTimeout(resolve, 100));

    // ===== Test 1: Basic span creation and OTLP payload structure =====
    const { result: result1, traceId: traceId1 } = await trace({ name: "test-span" }, async (_ctx) => {
      return "test";
    });
    expect(await result1).toBe("test");
    expect(traceId1).toBeTruthy();
    await flushSpans();

    expect(receivedRequests.length).toBeGreaterThan(0);
    const firstRequest = receivedRequests[receivedRequests.length - 1];
    expect(firstRequest.body).toHaveProperty("resourceSpans");
    expect(firstRequest.body.resourceSpans).toHaveLength(1);
    expect(firstRequest.body.resourceSpans[0]).toHaveProperty("scopeSpans");

    // ===== Test 2: Resource attributes =====
    const resourceAttributes = firstRequest.body.resourceSpans[0].resource.attributes;
    const resourceAttrMap = new Map(
      resourceAttributes.map((attr) => [attr.key, attr.value.stringValue])
    );
    expect(resourceAttrMap.get("service.name")).toBe("agentmark-client");
    expect(resourceAttrMap.get("agentmark.app_id")).toBe("test-app-id");

    // ===== Test 3: Tracer scope =====
    const scope = firstRequest.body.resourceSpans[0].scopeSpans[0].scope;
    expect(scope.name).toBe("agentmark");

    // ===== Test 4: Metadata attributes with prefix =====
    await trace(
      {
        name: "test-span-metadata",
        metadata: {
          sessionId: "session-123",
          userId: "user-456",
        },
      },
      async (_ctx) => {
        return "test";
      }
    );
    await flushSpans();

    const metadataRequest = receivedRequests[receivedRequests.length - 1];
    const metadataSpan = metadataRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
    const metadataAttrMap = new Map(
      metadataSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
    );
    expect(metadataAttrMap.get("agentmark.metadata.sessionId")).toBe("session-123");
    expect(metadataAttrMap.get("agentmark.metadata.userId")).toBe("user-456");

    // ===== Test 5: Events in OTLP export =====
    await trace({ name: "test-span-events" }, async (ctx) => {
      ctx.addEvent("test-event", { "event.key": "event-value" });
      return "test";
    });
    await flushSpans();

    const eventsRequest = receivedRequests[receivedRequests.length - 1];
    const eventsSpan = eventsRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(eventsSpan.events).toBeDefined();
    expect(eventsSpan.events!.length).toBeGreaterThan(0);
    const event = eventsSpan.events!.find((e) => e.name === "test-event");
    expect(event).toBeDefined();
    if (event && event.attributes) {
      const eventAttrMap = new Map(
        event.attributes.map((attr) => [attr.key, attr.value.stringValue])
      );
      expect(eventAttrMap.get("event.key")).toBe("event-value");
    }

    // ===== Test 6: Authentication headers =====
    const authRequest = receivedRequests[0];
    expect(authRequest.headers.authorization).toBe("test-api-key");
    expect(authRequest.headers["x-agentmark-app-id"]).toBe("test-app-id");

    // ===== Test 7: ctx.span() for child spans =====
    await trace({ name: "parent-span" }, async (ctx) => {
      const childResult = await ctx.span(
        {
          name: "child-span",
          metadata: { componentType: "processor" },
        },
        async (childCtx) => {
          expect(childCtx.traceId).toBe(ctx.traceId);
          expect(childCtx.spanId).not.toBe(ctx.spanId);
          return "child-result";
        }
      );
      expect(childResult).toBe("child-result");
      return "parent-result";
    });
    await flushSpans();

    const childSpanResult = findSpanByName("child-span");
    expect(childSpanResult).not.toBeNull();
    const childSpan = childSpanResult!.span;
    expect(childSpan.name).toBe("child-span");
    const childAttrMap = new Map(
      childSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
    );
    expect(childAttrMap.get("agentmark.metadata.componentType")).toBe("processor");

    // ===== Test 8: Error handling and error status =====
    try {
      await trace({ name: "error-span" }, async (_ctx) => {
        throw new Error("Test error");
      });
    } catch {
      // Expected
    }
    await flushSpans();

    const errorRequest = receivedRequests[receivedRequests.length - 1];
    const errorSpan = errorRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
    // OpenTelemetry uses numeric status codes: 1 = OK, 2 = ERROR
    expect(errorSpan.status?.code).toBe(2);

    // ===== Test 9: TraceContext - ctx.traceId =====
    let capturedTraceId: string = "";
    let capturedSpanId: string = "";
    const { traceId: returnedTraceId } = await trace({ name: "test-trace-id" }, async (ctx) => {
      capturedTraceId = ctx.traceId;
      capturedSpanId = ctx.spanId;
      return "test";
    });
    await flushSpans();
    expect(capturedTraceId).toBeTruthy();
    expect(typeof capturedTraceId).toBe("string");
    expect(capturedTraceId).toBe(returnedTraceId); // ctx.traceId matches returned traceId

    // ===== Test 10: TraceContext - ctx.spanId =====
    expect(capturedSpanId).toBeTruthy();
    expect(typeof capturedSpanId).toBe("string");
    expect(capturedSpanId).not.toBe(capturedTraceId); // spanId is different from traceId

    // ===== Test 11: TraceContext - setAttribute =====
    await trace({ name: "test-set-attribute" }, async (ctx) => {
      ctx.setAttribute("custom.key", "custom-value");
      ctx.setAttribute("custom.number", 42);
      ctx.setAttribute("custom.bool", true);
      return "test";
    });
    await flushSpans();

    const attrSpanResult = findSpanByName("test-set-attribute");
    expect(attrSpanResult).not.toBeNull();

    // ===== Test 12: Context Parameters - set agentmark.* attributes for context parameters in trace() =====
    await trace(
      {
        name: "test-context-params",
        sessionId: "session-123",
        sessionName: "test-session",
        userId: "user-456",
        datasetRunId: "run-789",
        datasetRunName: "test-run",
        datasetItemName: "item-1",
        datasetExpectedOutput: "expected-output",
      },
      async (_ctx) => {
        return "test";
      }
    );
    await flushSpans();

    const contextResult = findSpanByName("test-context-params");
    expect(contextResult).not.toBeNull();
    const contextSpan = contextResult!.span;
    const contextAttrMap = contextResult!.attrMap;

    expect(contextSpan.name).toBe("test-context-params");
    expect(contextAttrMap.get("agentmark.trace_name")).toBe("test-context-params");
    expect(contextAttrMap.get("agentmark.session_id")).toBe("session-123");
    expect(contextAttrMap.get("agentmark.session_name")).toBe("test-session");
    expect(contextAttrMap.get("agentmark.user_id")).toBe("user-456");
    expect(contextAttrMap.get("agentmark.dataset_run_id")).toBe("run-789");
    expect(contextAttrMap.get("agentmark.dataset_run_name")).toBe("test-run");
    expect(contextAttrMap.get("agentmark.dataset_item_name")).toBe("item-1");
    expect(contextAttrMap.get("agentmark.dataset_expected_output")).toBe("expected-output");

    // ===== Test 13: Nested spans with ctx.span() =====
    await trace({ name: "outer-trace" }, async (ctx) => {
      await ctx.span(
        {
          name: "inner-span-context",
          metadata: { level: "nested" },
        },
        async (innerCtx) => {
          // Verify child span has same traceId but different spanId
          expect(innerCtx.traceId).toBe(ctx.traceId);
          expect(innerCtx.spanId).not.toBe(ctx.spanId);
          return "nested-result";
        }
      );
      return "outer-result";
    });
    await flushSpans();

    const innerSpanResult = findSpanByName("inner-span-context");
    expect(innerSpanResult).not.toBeNull();
    const innerContextSpan = innerSpanResult!.span;
    const innerContextAttrMap = innerSpanResult!.attrMap;

    expect(innerContextSpan.name).toBe("inner-span-context");
    // child spans via ctx.span() should NOT set trace_name
    expect(innerContextAttrMap.get("agentmark.trace_name")).toBeUndefined();
    expect(innerContextAttrMap.get("agentmark.metadata.level")).toBe("nested");

    // ===== Test 14: Context Parameters - handle both context parameters and metadata =====
    await trace(
      {
        name: "test-mixed-params",
        sessionId: "session-999",
        userId: "user-888",
        metadata: {
          customKey: "custom-value",
          anotherKey: "another-value",
        },
      },
      async (_ctx) => {
        return "test";
      }
    );
    await flushSpans();

    const result3 = findSpanByName("test-mixed-params");
    expect(result3).not.toBeNull();
    const mixedSpan = result3!.span;
    const mixedAttrMap = result3!.attrMap;

    expect(mixedSpan.name).toBe("test-mixed-params");
    // Context parameters should be in agentmark.*
    expect(mixedAttrMap.get("agentmark.session_id")).toBe("session-999");
    expect(mixedAttrMap.get("agentmark.user_id")).toBe("user-888");
    // Metadata should be in agentmark.metadata.*
    expect(mixedAttrMap.get("agentmark.metadata.customKey")).toBe("custom-value");
    expect(mixedAttrMap.get("agentmark.metadata.anotherKey")).toBe("another-value");

    // ===== Test 15: Context Parameters - handle optional context parameters =====
    await trace(
      {
        name: "test-optional-params",
        sessionId: "session-only",
        // Other params omitted
      },
      async (_ctx) => {
        return "test";
      }
    );
    await flushSpans();

    const result4 = findSpanByName("test-optional-params");
    expect(result4).not.toBeNull();
    const optionalSpan = result4!.span;
    const optionalAttrMap = result4!.attrMap;

    expect(optionalSpan.name).toBe("test-optional-params");
    expect(optionalAttrMap.get("agentmark.session_id")).toBe("session-only");
    expect(optionalAttrMap.get("agentmark.user_id")).toBeUndefined();
    expect(optionalAttrMap.get("agentmark.dataset_run_id")).toBeUndefined();

    // ===== Test 16: Deep nesting (3 levels) with attributes at each level =====
    await trace({ name: "nested-level-0-root" }, async (rootCtx) => {
      // Set attribute on root span
      rootCtx.setAttribute("level", 0);
      rootCtx.addEvent("root-event", { "event.level": "0" });

      await rootCtx.span({ name: "nested-level-1-child" }, async (level1Ctx) => {
        // Set attribute on level 1 span
        level1Ctx.setAttribute("level", 1);
        level1Ctx.addEvent("level1-event", { "event.level": "1" });

        // Verify different spanIds but same traceId
        expect(level1Ctx.traceId).toBe(rootCtx.traceId);
        expect(level1Ctx.spanId).not.toBe(rootCtx.spanId);

        await level1Ctx.span({ name: "nested-level-2-grandchild" }, async (level2Ctx) => {
          // Set attribute on level 2 span
          level2Ctx.setAttribute("level", 2);
          level2Ctx.addEvent("level2-event", { "event.level": "2" });

          // Verify all have same traceId but different spanIds
          expect(level2Ctx.traceId).toBe(rootCtx.traceId);
          expect(level2Ctx.spanId).not.toBe(rootCtx.spanId);
          expect(level2Ctx.spanId).not.toBe(level1Ctx.spanId);

          return "level-2-result";
        });

        return "level-1-result";
      });

      return "level-0-result";
    });
    await flushSpans();

    // Verify each span has only its own attributes
    const nestedRootSpan = findSpanByName("nested-level-0-root");
    expect(nestedRootSpan).not.toBeNull();
    const nestedRootAttrMap = new Map(
      nestedRootSpan!.span.attributes.map((attr) => [attr.key, attr.value])
    );
    expect((nestedRootAttrMap.get("level") as any)?.intValue).toBe(0);
    expect(nestedRootSpan!.span.events?.some(e => e.name === "root-event")).toBe(true);
    expect(nestedRootSpan!.span.events?.some(e => e.name === "level1-event")).toBeFalsy();
    expect(nestedRootSpan!.span.events?.some(e => e.name === "level2-event")).toBeFalsy();

    const nestedLevel1Span = findSpanByName("nested-level-1-child");
    expect(nestedLevel1Span).not.toBeNull();
    const nestedLevel1AttrMap = new Map(
      nestedLevel1Span!.span.attributes.map((attr) => [attr.key, attr.value])
    );
    expect((nestedLevel1AttrMap.get("level") as any)?.intValue).toBe(1);
    expect(nestedLevel1Span!.span.events?.some(e => e.name === "level1-event")).toBe(true);
    expect(nestedLevel1Span!.span.events?.some(e => e.name === "root-event")).toBeFalsy();

    const nestedLevel2Span = findSpanByName("nested-level-2-grandchild");
    expect(nestedLevel2Span).not.toBeNull();
    const nestedLevel2AttrMap = new Map(
      nestedLevel2Span!.span.attributes.map((attr) => [attr.key, attr.value])
    );
    expect((nestedLevel2AttrMap.get("level") as any)?.intValue).toBe(2);
    expect(nestedLevel2Span!.span.events?.some(e => e.name === "level2-event")).toBe(true);

    // Verify parent-child relationships via parentSpanId
    // Root span should have no parent
    expect(nestedRootSpan!.span.parentSpanId).toBeFalsy();
    // Level 1 should have root as parent
    expect(nestedLevel1Span!.span.parentSpanId).toBe(nestedRootSpan!.span.spanId);
    // Level 2 should have level 1 as parent
    expect(nestedLevel2Span!.span.parentSpanId).toBe(nestedLevel1Span!.span.spanId);
    // All should share the same traceId
    expect(nestedLevel1Span!.span.traceId).toBe(nestedRootSpan!.span.traceId);
    expect(nestedLevel2Span!.span.traceId).toBe(nestedRootSpan!.span.traceId);

    // ===== Test 17: Parallel child spans =====
    await trace({ name: "parallel-parent" }, async (parentCtx) => {
      const [parallelResult1, parallelResult2, parallelResult3] = await Promise.all([
        parentCtx.span({ name: "parallel-child-1" }, async (ctx) => {
          ctx.setAttribute("child.index", 1);
          return "child-1";
        }),
        parentCtx.span({ name: "parallel-child-2" }, async (ctx) => {
          ctx.setAttribute("child.index", 2);
          return "child-2";
        }),
        parentCtx.span({ name: "parallel-child-3" }, async (ctx) => {
          ctx.setAttribute("child.index", 3);
          return "child-3";
        }),
      ]);

      expect(parallelResult1).toBe("child-1");
      expect(parallelResult2).toBe("child-2");
      expect(parallelResult3).toBe("child-3");

      return "parallel-done";
    });
    await flushSpans();

    // Verify all parallel children were created
    const parallelParent = findSpanByName("parallel-parent");
    const parallelChild1 = findSpanByName("parallel-child-1");
    const parallelChild2 = findSpanByName("parallel-child-2");
    const parallelChild3 = findSpanByName("parallel-child-3");
    expect(parallelParent).not.toBeNull();
    expect(parallelChild1).not.toBeNull();
    expect(parallelChild2).not.toBeNull();
    expect(parallelChild3).not.toBeNull();

    // Verify all children have the same parent (the parallel-parent span)
    expect(parallelChild1!.span.parentSpanId).toBe(parallelParent!.span.spanId);
    expect(parallelChild2!.span.parentSpanId).toBe(parallelParent!.span.spanId);
    expect(parallelChild3!.span.parentSpanId).toBe(parallelParent!.span.spanId);

    // ===== Test 18: Error in child span propagates to parent =====
    try {
      await trace({ name: "error-parent" }, async (parentCtx) => {
        parentCtx.setAttribute("parent.status", "started");

        await parentCtx.span({ name: "error-child" }, async (childCtx) => {
          childCtx.setAttribute("child.status", "started");
          throw new Error("Child error");
        });

        return "should-not-reach";
      });
    } catch (e: any) {
      expect(e.message).toBe("Child error");
    }
    await flushSpans();

    // Verify child span has error status
    const errorChild = findSpanByName("error-child");
    expect(errorChild).not.toBeNull();
    expect(errorChild!.span.status?.code).toBe(2); // ERROR

    // Verify parent span also has error status (error propagated)
    const errorParent = findSpanByName("error-parent");
    expect(errorParent).not.toBeNull();
    expect(errorParent!.span.status?.code).toBe(2); // ERROR

    // ===== Test 19: Caught error in child doesn't fail parent =====
    const { result: caughtResult } = await trace({ name: "catch-parent" }, async (parentCtx) => {
      parentCtx.setAttribute("parent.status", "started");

      try {
        await parentCtx.span({ name: "catch-child" }, async (childCtx) => {
          childCtx.setAttribute("child.status", "started");
          throw new Error("Caught child error");
        });
      } catch {
        // Caught - parent should succeed
      }

      parentCtx.setAttribute("parent.status", "completed");
      return "parent-success";
    });
    await flushSpans();

    expect(await caughtResult).toBe("parent-success");

    // Verify parent span has OK status
    const catchParent = findSpanByName("catch-parent");
    expect(catchParent).not.toBeNull();
    expect(catchParent!.span.status?.code).toBe(1); // OK

    // Verify child span has ERROR status
    const catchChild = findSpanByName("catch-child");
    expect(catchChild).not.toBeNull();
    expect(catchChild!.span.status?.code).toBe(2); // ERROR

    // ===== Test 20: Batch span processor =====
    // Shutdown current SDK and restart with batch processor
    await activeSdk.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 300));

    activeSdk = sdk.initTracing({ disableBatch: false });

    await trace({ name: "span-1" }, async (_ctx) => "1");
    await trace({ name: "span-2" }, async (_ctx) => "2");
    await trace({ name: "span-3" }, async (_ctx) => "3");

    // Force flush and wait for batch to flush
    await flushSpans();
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Count all spans from batch requests
    const batchRequests = receivedRequests.slice(
      receivedRequests.length - 5, // Get last few requests (batch may send multiple)
      receivedRequests.length
    );
    const totalSpans = batchRequests.reduce(
      (sum, req) =>
        sum +
        req.body.resourceSpans.reduce(
          (s, rs) =>
            s + rs.scopeSpans.reduce((ss, scs) => ss + scs.spans.length, 0),
          0
        ),
      0
    );
    expect(totalSpans).toBeGreaterThanOrEqual(3);
  });
});
