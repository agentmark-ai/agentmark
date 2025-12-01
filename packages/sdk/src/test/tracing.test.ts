import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { trace, component } from "../trace/tracing";
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
});
