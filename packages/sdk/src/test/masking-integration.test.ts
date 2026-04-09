import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import { span } from "../trace/tracing";
import { AgentMarkSDK } from "../agentmark";
import { createPiiMasker } from "../trace/pii-masker";
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
        attributes: Array<{
          key: string;
          value: { stringValue?: string; intValue?: number };
        }>;
        events?: Array<{
          name: string;
          timeUnixNano: string;
          attributes?: Array<{
            key: string;
            value: { stringValue?: string };
          }>;
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

describe("PII Masking Integration (full OTLP pipeline)", () => {
  let server: Server;
  let serverUrl: string;
  let receivedRequests: Array<{
    body: OTLPRequest;
    headers: Record<string, string | string[] | undefined>;
  }>;

  async function flushSpans() {
    const provider = api.trace.getTracerProvider() as any;
    if (provider.forceFlush) {
      await provider.forceFlush();
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  function findSpanByName(spanName: string): {
    span: OTLPRequest["resourceSpans"][0]["scopeSpans"][0]["spans"][0];
    attrMap: Map<string, string | undefined>;
  } | null {
    for (let i = receivedRequests.length - 1; i >= 0; i--) {
      const request = receivedRequests[i];
      for (const resourceSpan of request.body.resourceSpans) {
        for (const scopeSpan of resourceSpan.scopeSpans) {
          for (const span of scopeSpan.spans) {
            if (span.name === spanName) {
              const attrMap = new Map(
                span.attributes.map((attr) => [
                  attr.key,
                  attr.value.stringValue,
                ])
              );
              return { span, attrMap };
            }
            const traceNameAttr = span.attributes.find(
              (attr) => attr.key === "agentmark.trace_name"
            );
            if (traceNameAttr?.value.stringValue === spanName) {
              const attrMap = new Map(
                span.attributes.map((attr) => [
                  attr.key,
                  attr.value.stringValue,
                ])
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
          console.error(
            "Error parsing request:",
            e,
            body.substring(0, 200)
          );
          res.writeHead(400);
          res.end();
        }
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as AddressInfo;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }
  });

  it(
    "should test full OTLP pipeline masking across all configurations",
    { timeout: 120000 },
    async () => {
      // ===== Test 1: Mask function redacts input/output in exported payload =====
      const sdk1 = new AgentMarkSDK({
        apiKey: "test-api-key",
        appId: "test-app-id",
        baseUrl: serverUrl,
        mask: (s) => s.replace(/secret-\w+/g, "[MASKED]"),
      });
      let activeSdk = sdk1.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await span({ name: "mask-fn-redacts-io" }, async (ctx) => {
        ctx.setInput("data: secret-abc123");
        ctx.setOutput("result: secret-xyz789");
        return "done";
      });
      await flushSpans();

      const maskedIo = findSpanByName("mask-fn-redacts-io");
      expect(maskedIo).not.toBeNull();
      const inputVal = maskedIo!.attrMap.get("gen_ai.request.input");
      const outputVal = maskedIo!.attrMap.get("gen_ai.response.output");
      expect(inputVal).toBeDefined();
      expect(outputVal).toBeDefined();
      // setInput/setOutput serialize via JSON.stringify, so value is a JSON string
      expect(inputVal).toContain("[MASKED]");
      expect(inputVal).not.toContain("secret-abc123");
      expect(outputVal).toContain("[MASKED]");
      expect(outputVal).not.toContain("secret-xyz789");

      // Shutdown SDK 1 and reset OTel global state
      await activeSdk.shutdown();
      api.trace.disable();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ===== Test 2: createPiiMasker redacts email in exported payload =====
      const sdk2 = new AgentMarkSDK({
        apiKey: "test-api-key",
        appId: "test-app-id",
        baseUrl: serverUrl,
        mask: createPiiMasker({ email: true }),
      });
      activeSdk = sdk2.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await span({ name: "pii-masker-email" }, async (ctx) => {
        ctx.setInput("User email: test@example.com");
        return "done";
      });
      await flushSpans();

      const emailResult = findSpanByName("pii-masker-email");
      expect(emailResult).not.toBeNull();
      const emailInput = emailResult!.attrMap.get("gen_ai.request.input");
      expect(emailInput).toBeDefined();
      expect(emailInput).toContain("[EMAIL]");
      expect(emailInput).not.toContain("test@example.com");

      // Shutdown SDK 2 and reset OTel global state
      await activeSdk.shutdown();
      api.trace.disable();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ===== Test 3: Non-sensitive attributes pass through unmasked =====
      const sdk3 = new AgentMarkSDK({
        apiKey: "test-api-key",
        appId: "test-app-id",
        baseUrl: serverUrl,
        mask: (s) => s.replace(/sensitive/g, "[MASKED]"),
      });
      activeSdk = sdk3.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await span(
        { name: "non-sensitive-passthrough", metadata: { env: "test-sensitive" } },
        async (ctx) => {
          ctx.setAttribute("gen_ai.request.model", "gpt-4-sensitive");
          ctx.setAttribute("gen_ai.usage.input_tokens", 100);
          ctx.setInput("sensitive user data");
          return "done";
        }
      );
      await flushSpans();

      const passthroughResult = findSpanByName("non-sensitive-passthrough");
      expect(passthroughResult).not.toBeNull();

      // agentmark.trace_name should NOT be masked (operational attribute)
      expect(passthroughResult!.attrMap.get("agentmark.trace_name")).toBe(
        "non-sensitive-passthrough"
      );

      // gen_ai.request.model should NOT be masked (not in SENSITIVE_KEYS)
      expect(passthroughResult!.attrMap.get("gen_ai.request.model")).toBe(
        "gpt-4-sensitive"
      );

      // Token count is a number, should be untouched (non-string values are skipped)
      const tokenAttr = passthroughResult!.span.attributes.find(
        (a) => a.key === "gen_ai.usage.input_tokens"
      );
      expect(tokenAttr).toBeDefined();
      expect(tokenAttr!.value.intValue).toBe(100);

      // But the gen_ai.request.input SHOULD be masked
      const inputMasked = passthroughResult!.attrMap.get(
        "gen_ai.request.input"
      );
      expect(inputMasked).toContain("[MASKED]");
      expect(inputMasked).not.toContain("sensitive");

      // Metadata IS masked (agentmark.metadata.* keys are processed)
      const metadataVal = passthroughResult!.attrMap.get(
        "agentmark.metadata.env"
      );
      expect(metadataVal).toBeDefined();
      expect(metadataVal).toContain("[MASKED]");
      expect(metadataVal).not.toContain("sensitive");

      // Shutdown SDK 3 and reset OTel global state
      await activeSdk.shutdown();
      api.trace.disable();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ===== Test 4: Fail-closed — mask error drops span =====
      const sdk4 = new AgentMarkSDK({
        apiKey: "test-api-key",
        appId: "test-app-id",
        baseUrl: serverUrl,
        mask: () => {
          throw new Error("mask exploded");
        },
      });
      activeSdk = sdk4.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      await span({ name: "fail-closed-dropped" }, async (ctx) => {
        ctx.setInput("this should cause mask to throw");
        return "done";
      });
      await flushSpans();

      // The span with the throwing mask should NOT appear in the exported payload
      const droppedSpan = findSpanByName("fail-closed-dropped");
      expect(droppedSpan).toBeNull();

      // Verify tracing continues working after the error by sending a
      // subsequent span (without sensitive data that would trigger the mask).
      // Actually the mask runs on all sensitive keys, so any span with
      // gen_ai attributes will be dropped. Let's verify the span simply
      // did not arrive — that's the fail-closed guarantee.

      // Shutdown SDK 4 and reset OTel global state
      await activeSdk.shutdown();
      api.trace.disable();
      await new Promise((resolve) => setTimeout(resolve, 500));

      // ===== Test 5: Env var HIDE_INPUTS suppression =====
      process.env.AGENTMARK_HIDE_INPUTS = "true";
      try {
        const sdk5 = new AgentMarkSDK({
          apiKey: "test-api-key",
          appId: "test-app-id",
          baseUrl: serverUrl,
        });
        activeSdk = sdk5.initTracing({ disableBatch: true });
        await new Promise((resolve) => setTimeout(resolve, 500));

        await span({ name: "hide-inputs-env" }, async (ctx) => {
          ctx.setInput("this should be redacted by env var");
          ctx.setOutput("this output should be visible");
          return "done";
        });
        await flushSpans();

        const hideResult = findSpanByName("hide-inputs-env");
        expect(hideResult).not.toBeNull();

        const hiddenInput = hideResult!.attrMap.get("gen_ai.request.input");
        expect(hiddenInput).toBe("[REDACTED]");

        // Output should NOT be redacted (only HIDE_INPUTS is set)
        const visibleOutput = hideResult!.attrMap.get(
          "gen_ai.response.output"
        );
        expect(visibleOutput).toBeDefined();
        expect(visibleOutput).not.toBe("[REDACTED]");

        await activeSdk.shutdown();
        api.trace.disable();
        await new Promise((resolve) => setTimeout(resolve, 300));
      } finally {
        delete process.env.AGENTMARK_HIDE_INPUTS;
      }
    }
  );
});
