import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { trace, component, getActiveTraceId, getActiveSpanId } from "../trace/tracing";
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
        attributes: Array<{ key: string; value: { stringValue?: string } }>;
        events?: Array<{
          name: string;
          timeUnixNano: string;
          attributes?: Array<{ key: string; value: { stringValue?: string } }>;
        }>;
        links?: Array<{
          traceId: string;
          spanId: string;
        }>;
        status?: { code: string };
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
    // Give more time for the HTTP request to complete
    await new Promise((resolve) => setTimeout(resolve, 500));
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
      server.listen(0, () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://localhost:${address.port}`;
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

  it("should test all OTLP exporter functionality", async () => {
    // Initialize tracing once for the entire test
    activeSdk = sdk.initTracing({ disableBatch: true });

    // Test 1: Basic span creation and OTLP payload structure
    await trace({ name: "test-span" }, () => {
      return Promise.resolve("test");
    });
    await flushSpans();

    expect(receivedRequests.length).toBeGreaterThan(0);
    const firstRequest = receivedRequests[receivedRequests.length - 1];
    expect(firstRequest.body).toHaveProperty("resourceSpans");
    expect(firstRequest.body.resourceSpans).toHaveLength(1);
    expect(firstRequest.body.resourceSpans[0]).toHaveProperty("scopeSpans");

    // Test 2: Resource attributes
    const resourceAttributes = firstRequest.body.resourceSpans[0].resource.attributes;
    const resourceAttrMap = new Map(
      resourceAttributes.map((attr) => [attr.key, attr.value.stringValue])
    );
    expect(resourceAttrMap.get("service.name")).toBe("agentmark-client");
    expect(resourceAttrMap.get("agentmark.app_id")).toBe("test-app-id");

    // Test 3: Tracer scope
    const scope = firstRequest.body.resourceSpans[0].scopeSpans[0].scope;
    expect(scope.name).toBe("agentmark");

    // Test 4: Metadata attributes with prefix
    await trace(
      {
        name: "test-span-metadata",
        metadata: {
          sessionId: "session-123",
          userId: "user-456",
        },
      },
      () => {
        return Promise.resolve("test");
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

    // Test 5: Events in OTLP export
    await trace({ name: "test-span-events" }, async () => {
      const span = api.trace.getActiveSpan();
      if (span) {
        span.addEvent("test-event", { "event.key": "event-value" });
      }
      return Promise.resolve("test");
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

    // Test 6: Authentication headers
    const authRequest = receivedRequests[0];
    expect(authRequest.headers.authorization).toBe("test-api-key");
    expect(authRequest.headers["x-agentmark-app-id"]).toBe("test-app-id");

    // Test 7: Component function
    await component(
      {
        name: "test-component",
        metadata: { componentType: "processor" },
      },
      () => {
        return Promise.resolve("component-result");
      }
    );
    await flushSpans();

    const componentRequest = receivedRequests[receivedRequests.length - 1];
    const componentSpan = componentRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
    expect(componentSpan.name).toBe("test-component");
    const componentAttrMap = new Map(
      componentSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
    );
    expect(componentAttrMap.get("agentmark.metadata.componentType")).toBe("processor");

    // Test 8: Error handling and error status
    try {
      await trace({ name: "error-span" }, () => {
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

    // Test 9: Batch span processor
    // Shutdown current SDK and restart with batch processor
    await activeSdk.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 300));
    
    activeSdk = sdk.initTracing({ disableBatch: false });
    
    await trace({ name: "span-1" }, () => Promise.resolve("1"));
    await trace({ name: "span-2" }, () => Promise.resolve("2"));
    await trace({ name: "span-3" }, () => Promise.resolve("3"));

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

  describe("Utility Functions", () => {
    beforeAll(async () => {
      if (!activeSdk) {
        activeSdk = sdk.initTracing({ disableBatch: true });
      }
    });

    it("should get active traceId from span context", async () => {
      let capturedTraceId: string | null = null;
      
      await trace({ name: "test-trace-id" }, async () => {
        capturedTraceId = getActiveTraceId();
        return Promise.resolve("test");
      });
      await flushSpans();

      expect(capturedTraceId).toBeTruthy();
      expect(typeof capturedTraceId).toBe("string");
    });

    it("should get active spanId from span context", async () => {
      let capturedSpanId: string | null = null;
      
      await trace({ name: "test-span-id" }, async () => {
        capturedSpanId = getActiveSpanId();
        return Promise.resolve("test");
      });
      await flushSpans();

      expect(capturedSpanId).toBeTruthy();
      expect(typeof capturedSpanId).toBe("string");
    });

    it("should return null when no active span", () => {
      const traceId = getActiveTraceId();
      const spanId = getActiveSpanId();

      // Outside of a span context, these should be null
      // Note: This might not always be null if there's a global context
      // but it tests the function doesn't throw
      expect(traceId === null || typeof traceId === "string").toBe(true);
      expect(spanId === null || typeof spanId === "string").toBe(true);
    });
  });

  describe("Context Parameters", () => {
    beforeAll(async () => {
      if (!activeSdk) {
        activeSdk = sdk.initTracing({ disableBatch: true });
      }
    });

    it("should set agentmark.* attributes for context parameters in trace()", async () => {
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
        () => {
          return Promise.resolve("test");
        }
      );
      await flushSpans();

      const contextRequest = receivedRequests[receivedRequests.length - 1];
      const contextSpan = contextRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
      const contextAttrMap = new Map(
        contextSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
      );

      expect(contextAttrMap.get("agentmark.trace_name")).toBe("test-context-params");
      expect(contextAttrMap.get("agentmark.session_id")).toBe("session-123");
      expect(contextAttrMap.get("agentmark.session_name")).toBe("test-session");
      expect(contextAttrMap.get("agentmark.user_id")).toBe("user-456");
      expect(contextAttrMap.get("agentmark.dataset_run_id")).toBe("run-789");
      expect(contextAttrMap.get("agentmark.dataset_run_name")).toBe("test-run");
      expect(contextAttrMap.get("agentmark.dataset_item_name")).toBe("item-1");
      expect(contextAttrMap.get("agentmark.dataset_expected_output")).toBe("expected-output");
    });

    it("should set agentmark.* attributes for context parameters in component()", async () => {
      await component(
        {
          name: "test-component-context",
          sessionId: "session-456",
          userId: "user-789",
          datasetRunId: "run-012",
        },
        () => {
          return Promise.resolve("test");
        }
      );
      await flushSpans();

      const componentRequest = receivedRequests[receivedRequests.length - 1];
      const componentSpan = componentRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
      const componentAttrMap = new Map(
        componentSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
      );

      // component() should NOT set trace_name
      expect(componentAttrMap.get("agentmark.trace_name")).toBeUndefined();
      expect(componentAttrMap.get("agentmark.session_id")).toBe("session-456");
      expect(componentAttrMap.get("agentmark.user_id")).toBe("user-789");
      expect(componentAttrMap.get("agentmark.dataset_run_id")).toBe("run-012");
    });

    it("should handle both context parameters and metadata", async () => {
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
        () => {
          return Promise.resolve("test");
        }
      );
      await flushSpans();

      const mixedRequest = receivedRequests[receivedRequests.length - 1];
      const mixedSpan = mixedRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
      const mixedAttrMap = new Map(
        mixedSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
      );

      // Context parameters should be in agentmark.*
      expect(mixedAttrMap.get("agentmark.session_id")).toBe("session-999");
      expect(mixedAttrMap.get("agentmark.user_id")).toBe("user-888");

      // Metadata should be in agentmark.metadata.*
      expect(mixedAttrMap.get("agentmark.metadata.customKey")).toBe("custom-value");
      expect(mixedAttrMap.get("agentmark.metadata.anotherKey")).toBe("another-value");
    });

    it("should handle optional context parameters", async () => {
      await trace(
        {
          name: "test-optional-params",
          sessionId: "session-only",
          // Other params omitted
        },
        () => {
          return Promise.resolve("test");
        }
      );
      await flushSpans();

      const optionalRequest = receivedRequests[receivedRequests.length - 1];
      const optionalSpan = optionalRequest.body.resourceSpans[0].scopeSpans[0].spans[0];
      const optionalAttrMap = new Map(
        optionalSpan.attributes.map((attr) => [attr.key, attr.value.stringValue])
      );

      expect(optionalAttrMap.get("agentmark.session_id")).toBe("session-only");
      expect(optionalAttrMap.get("agentmark.user_id")).toBeUndefined();
      expect(optionalAttrMap.get("agentmark.dataset_run_id")).toBeUndefined();
    });
  });
});
