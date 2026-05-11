/**
 * End-to-end regression test against the REAL @sentry/node SDK.
 *
 * The companion test in tracing-isolation.test.ts simulates the OTel global
 * tracer collision by manually constructing a NodeTracerProvider and calling
 * .register(). This file installs and runs the actual @sentry/node SDK so we
 * catch any Sentry-specific OTel behavior (SentryContextManager,
 * SentrySpanProcessor, SentryPropagator) that the simulation might miss.
 *
 * Reproduces the exact production scenario from issue #1131:
 *   Sentry.init({...})  <-- claims OTel global
 *   am.initTracing()    <-- pre-fix: silently ignored. post-fix: works.
 *   am.span(...)        <-- pre-fix: dropped. post-fix: exported.
 */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import * as Sentry from "@sentry/node";
import { AgentMarkSDK } from "../agentmark";
import { span } from "../trace/tracing";
import { observe } from "../trace/traced";

interface OTLPRequest {
  resourceSpans: Array<{
    scopeSpans: Array<{
      spans: Array<{ name: string; attributes: Array<{ key: string }> }>;
    }>;
  }>;
}

describe("Real @sentry/node coexistence (issue #1131)", () => {
  let server: Server;
  let serverUrl: string;
  let receivedAgentmarkRequests: Array<{ body: OTLPRequest }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeSdk: any;

  function findAgentmarkSpanByName(name: string): boolean {
    for (const req of receivedAgentmarkRequests) {
      for (const rs of req.body.resourceSpans ?? []) {
        for (const ss of rs.scopeSpans ?? []) {
          for (const sp of ss.spans ?? []) {
            if (sp.name === name) return true;
          }
        }
      }
    }
    return false;
  }

  beforeAll(async () => {
    receivedAgentmarkRequests = [];
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk.toString();
      });
      req.on("end", () => {
        try {
          receivedAgentmarkRequests.push({ body: JSON.parse(body) });
          res.writeHead(200);
          res.end();
        } catch {
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

  afterEach(async () => {
    if (activeSdk) {
      await activeSdk.shutdown();
      activeSdk = null;
    }
    // Sentry.close() drains pending events and unregisters the OTel global.
    // Use a short timeout so the fake DSN doesn't make us hang.
    await Sentry.close(2000);
    receivedAgentmarkRequests.length = 0;
  });

  it(
    "AgentMark spans flow to AgentMark when @sentry/node is initialized first",
    { timeout: 30000 },
    async () => {
      // 1. Sentry initializes FIRST. This is the trigger condition for
      //    issue #1131: @sentry/node@10 registers a NodeTracerProvider as
      //    the OTel global during init().
      //
      //    The fake DSN points at a non-routable address; tracesSampleRate=1
      //    forces Sentry to fully wire its OTel pipeline (sampler, span
      //    processor, propagator, context manager). We never check what
      //    Sentry exports — just that AgentMark survives Sentry's setup.
      Sentry.init({
        dsn: "https://abc@127.0.0.1:1/1",
        tracesSampleRate: 1.0,
        // Drop transports so Sentry doesn't spam logs trying to phone home.
        transport: () => ({
          send: () => Promise.resolve({}),
          flush: () => Promise.resolve(true),
        }),
      });

      // 2. AgentMark initializes SECOND — the broken case in the original bug.
      const sdk = new AgentMarkSDK({
        apiKey: "test-key",
        appId: "test-app",
        baseUrl: serverUrl,
      });
      activeSdk = sdk.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 3. Real user code: call AgentMark's span().
      const { result } = await span(
        {
          name: "agentmark-with-real-sentry",
          metadata: { test: "real-sentry" },
        },
        async (ctx) => {
          ctx.setInput({ query: "hello" });
          ctx.setOutput("world");
          return "ok";
        }
      );
      expect(await result).toBe("ok");

      // 4. Force flush AgentMark's exporter and verify the span landed at
      //    AgentMark's HTTP server. Pre-fix this would have been zero spans.
      await activeSdk.forceFlush();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(findAgentmarkSpanByName("agentmark-with-real-sentry")).toBe(true);
    }
  );

  it(
    "observe() also flows to AgentMark when @sentry/node is initialized first",
    { timeout: 30000 },
    async () => {
      Sentry.init({
        dsn: "https://abc@127.0.0.1:1/1",
        tracesSampleRate: 1.0,
        transport: () => ({
          send: () => Promise.resolve({}),
          flush: () => Promise.resolve(true),
        }),
      });

      const sdk = new AgentMarkSDK({
        apiKey: "test-key",
        appId: "test-app",
        baseUrl: serverUrl,
      });
      activeSdk = sdk.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      const observed = observe(
        async (input: string) => `processed:${input}`,
        { name: "observed-with-real-sentry" }
      );
      const out = await observed("payload");
      expect(out).toBe("processed:payload");

      await activeSdk.forceFlush();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(findAgentmarkSpanByName("observed-with-real-sentry")).toBe(true);
    }
  );

  it(
    "parent/child relationships hold under Sentry's context manager",
    { timeout: 30000 },
    async () => {
      // Sentry installs SentryContextManager. AgentMark's
      // setGlobalContextManager() call becomes a no-op. The question this
      // test answers: does parent/child span propagation across awaits
      // still work when SentryContextManager is the active one?
      Sentry.init({
        dsn: "https://abc@127.0.0.1:1/1",
        tracesSampleRate: 1.0,
        transport: () => ({
          send: () => Promise.resolve({}),
          flush: () => Promise.resolve(true),
        }),
      });

      const sdk = new AgentMarkSDK({
        apiKey: "test-key",
        appId: "test-app",
        baseUrl: serverUrl,
      });
      activeSdk = sdk.initTracing({ disableBatch: true });
      await new Promise((resolve) => setTimeout(resolve, 500));

      let capturedParentTraceId = "";
      let capturedChildTraceId = "";
      let capturedParentSpanId = "";
      let capturedChildSpanId = "";

      await span({ name: "parent-with-sentry" }, async (parentCtx) => {
        capturedParentTraceId = parentCtx.traceId;
        capturedParentSpanId = parentCtx.spanId;

        await parentCtx.span(
          { name: "child-with-sentry" },
          async (childCtx) => {
            capturedChildTraceId = childCtx.traceId;
            capturedChildSpanId = childCtx.spanId;
            return "child";
          }
        );

        return "parent";
      });

      // The whole point of context propagation: child shares parent's
      // traceId but has a distinct spanId.
      expect(capturedParentTraceId).toBeTruthy();
      expect(capturedChildTraceId).toBe(capturedParentTraceId);
      expect(capturedChildSpanId).not.toBe(capturedParentSpanId);

      await activeSdk.forceFlush();
      await new Promise((resolve) => setTimeout(resolve, 2000));

      expect(findAgentmarkSpanByName("parent-with-sentry")).toBe(true);
      expect(findAgentmarkSpanByName("child-with-sentry")).toBe(true);
    }
  );
});
