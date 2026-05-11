/**
 * Regression tests for https://github.com/agentmark-ai/app/issues/1131
 *
 * Sentry (and other OTel-based SDKs) register themselves as the OTel global
 * tracer provider on init. Because the global registry is "first writer wins",
 * AgentMark's old initialize() would silently fail to export anything when
 * Sentry was loaded first.
 *
 * The fix moves AgentMark to a dedicated NodeTracerProvider that does NOT
 * touch the global registry by default. These tests prove:
 *
 *   1. AgentMark spans flow to AgentMark's exporter even when another SDK
 *      has already claimed the OTel global tracer provider.
 *   2. The global tracer provider is left alone (Sentry keeps working).
 *   3. The `registerGlobally: true` opt-in escape hatch still works.
 *   4. Calling span()/observe() before initTracing() warns instead of
 *      crashing.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import api from "@opentelemetry/api";
import {
  InMemorySpanExporter,
  NodeTracerProvider,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { AgentMarkSDK } from "../agentmark";
import { _resetWarnedForTests, getAgentmarkTracer, span } from "../trace/tracing";
import { observe } from "../trace/traced";

interface OTLPRequest {
  resourceSpans: Array<{
    scopeSpans: Array<{
      spans: Array<{ name: string }>;
    }>;
  }>;
}

describe("Tracing isolation (issue #1131)", () => {
  let server: Server;
  let serverUrl: string;
  let receivedAgentmarkRequests: Array<{ body: OTLPRequest }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeSdk: any;

  // Simulates Sentry's global OTel provider — collects spans in memory so
  // we can assert AgentMark spans do NOT leak into it.
  let sentryStyleProvider: NodeTracerProvider | null;
  let sentryExporter: InMemorySpanExporter | null;

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

  beforeEach(() => {
    receivedAgentmarkRequests.length = 0;
    sentryStyleProvider = null;
    sentryExporter = null;
    _resetWarnedForTests();
  });

  afterEach(async () => {
    if (activeSdk) {
      await activeSdk.shutdown();
      activeSdk = null;
    }
    if (sentryStyleProvider) {
      await sentryStyleProvider.shutdown();
      sentryStyleProvider = null;
    }
    sentryExporter = null;
    // Clean OTel global state so each test starts from zero.
    api.trace.disable();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  // Helper: register a "Sentry-style" NodeTracerProvider as the OTel global,
  // BEFORE AgentMark inits. Mirrors what @sentry/node does internally.
  function installSentryStyleGlobalProvider(): InMemorySpanExporter {
    sentryExporter = new InMemorySpanExporter();
    sentryStyleProvider = new NodeTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(sentryExporter)],
    });
    sentryStyleProvider.register();
    return sentryExporter;
  }

  it("AgentMark spans still reach AgentMark when a Sentry-style global provider was registered first", async () => {
    // Sentry-equivalent setup runs BEFORE AgentMark — this is the trigger
    // condition for issue #1131.
    const sentryInMem = installSentryStyleGlobalProvider();

    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 300));

    await span({ name: "agentmark-after-sentry" }, async () => "done");

    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Primary assertion: AgentMark's HTTP exporter saw the span.
    // Pre-fix this would fail because sdk.start() became a silent no-op.
    expect(findAgentmarkSpanByName("agentmark-after-sentry")).toBe(true);

    // Secondary assertion: Sentry's in-memory provider did NOT receive
    // AgentMark spans. AgentMark and Sentry are isolated.
    const sentrySpanNames = sentryInMem.getFinishedSpans().map((s) => s.name);
    expect(sentrySpanNames).not.toContain("agentmark-after-sentry");
  });

  it("observe() also flows to AgentMark when a Sentry-style global provider was registered first", async () => {
    // Same setup, but use observe() instead of span() to cover the second
    // call site.
    const sentryInMem = installSentryStyleGlobalProvider();

    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const observed = observe(
      async (q: string) => `result:${q}`,
      { name: "observed-after-sentry" }
    );
    await observed("hello");

    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(findAgentmarkSpanByName("observed-after-sentry")).toBe(true);
    const sentrySpanNames = sentryInMem.getFinishedSpans().map((s) => s.name);
    expect(sentrySpanNames).not.toContain("observed-after-sentry");
  });

  it("AgentMark-first then Sentry-second: AgentMark does not steal the OTel global", async () => {
    // This is the test that genuinely distinguishes pre-fix from post-fix.
    //
    // PRE-FIX: AgentMark's NodeSDK.start() called setGlobalTracerProvider().
    //          When AgentMark inits FIRST, it claims the global. Then a
    //          Sentry-style provider.register() call becomes a silent no-op.
    //          Result: third-party code calling api.trace.getTracer() gets
    //          AgentMark's tracer — and any span it creates flows out via
    //          AgentMark's OTLP HTTP exporter. That's wrong: a third-party
    //          OTel library shouldn't have its spans leaking into AgentMark.
    //
    // POST-FIX: AgentMark uses a dedicated provider and does NOT touch the
    //          global. Sentry's provider.register() succeeds. Third-party
    //          code's spans go to Sentry.
    //
    // The assertions below FLIP between the two states, so this test is a
    // hard regression guard.

    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Now the Sentry-style provider tries to claim the global.
    // Post-fix this succeeds; pre-fix this would have been a no-op because
    // AgentMark already won the race.
    const sentryInMem = installSentryStyleGlobalProvider();

    // A third-party library — totally unaware of AgentMark — uses the OTel
    // global API. This is the exact codepath things like the Vercel AI SDK,
    // OpenLLMetry auto-instrumentation, and arbitrary OTel libs go through.
    const tracer = api.trace.getTracer("third-party-lib");
    tracer.startActiveSpan("third-party-span", (s) => s.end());

    await sentryStyleProvider!.forceFlush();
    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Post-fix: the third-party span lands in Sentry, not AgentMark.
    // Pre-fix: this assertion would FAIL (Sentry's exporter never saw it
    // because AgentMark stole the global).
    const sentrySpanNames = sentryInMem.getFinishedSpans().map((s) => s.name);
    expect(sentrySpanNames).toContain("third-party-span");

    // Post-fix: AgentMark's HTTP server did NOT see the third-party span.
    // Pre-fix: this assertion would FAIL (AgentMark's exporter received it
    // because AgentMark owned the global).
    expect(findAgentmarkSpanByName("third-party-span")).toBe(false);

    // Sanity: AgentMark's OWN span() helper still works in this scenario.
    await span({ name: "agentmark-first-then-sentry" }, async () => "ok");
    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(findAgentmarkSpanByName("agentmark-first-then-sentry")).toBe(true);
  });

  it("registerGlobally: true escape hatch wires AgentMark into the OTel global", async () => {
    // No prior global provider — the opt-in path should claim it.
    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });
    activeSdk = sdk.initTracing({ disableBatch: true, registerGlobally: true });
    await new Promise((resolve) => setTimeout(resolve, 300));

    // A third-party library calling api.trace.getTracer() now gets a tracer
    // that exports to AgentMark.
    const tracer = api.trace.getTracer("third-party-lib");
    tracer.startActiveSpan("third-party-via-global", (s) => s.end());

    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(findAgentmarkSpanByName("third-party-via-global")).toBe(true);
  });

  it("warns once and does not throw when span() runs before initTracing()", async () => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (msg: string) => warnings.push(msg);

    try {
      // Two calls back-to-back — the warning should fire exactly once.
      await span({ name: "uninit-1" }, async () => "ok");
      await span({ name: "uninit-2" }, async () => "ok");

      const tracingWarnings = warnings.filter((w) =>
        w.includes("[agentmark]")
      );
      expect(tracingWarnings.length).toBe(1);
      expect(tracingWarnings[0]).toContain("initTracing");
    } finally {
      console.warn = originalWarn;
    }
  });

  it("getAgentmarkTracer() returns a working tracer after init, regardless of global state", async () => {
    installSentryStyleGlobalProvider();

    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });
    activeSdk = sdk.initTracing({ disableBatch: true });

    const tracer = getAgentmarkTracer();
    expect(tracer).toBeDefined();
    // The tracer should NOT be the same instance the OTel global hands out
    // (which would be Sentry's). Comparing by reference is the simplest
    // proof of isolation.
    expect(tracer).not.toBe(api.trace.getTracer("agentmark"));
  });

  it("re-initialization replaces the dedicated provider cleanly", async () => {
    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: serverUrl,
    });

    const first = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    // Second init must shut down the first to avoid a leaked exporter.
    // We assert that span() after re-init still produces exported spans
    // (proves the new provider is the one in use).
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    await span({ name: "after-reinit" }, async () => "ok");
    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1500));

    expect(findAgentmarkSpanByName("after-reinit")).toBe(true);

    // Calling shutdown on the original (already-replaced) provider should
    // not throw. NodeTracerProvider's shutdown is idempotent.
    await expect(first.shutdown()).resolves.not.toThrow();
  });
});
