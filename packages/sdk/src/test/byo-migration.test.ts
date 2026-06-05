/**
 * BYO-SDK migration proof — "we don't care what they bring".
 *
 * Goal of this file: prove, end-to-end against the real SDK, that a team with
 * a PRE-EXISTING raw LLM SDK (here a fake AWS Bedrock client — NOT the Vercel
 * AI SDK, NOT any AgentMark adapter) can adopt AgentMark for **tracing** and
 * **experiments/evals** WITHOUT writing a custom Adapter or Executor. The only
 * AgentMark surface they touch is:
 *
 *   1. `sdk.initTracing()`            — point traces at AgentMark
 *   2. `observe(fn)` / `span()`       — wrap their own SDK calls (any function)
 *   3. `sdk.runExperiment({ task })`  — run a dataset through THEIR call + gate
 *
 * (Prompt management — the third leg — is proven SDK-agnostically in
 * prompt-core/test/byo-prompt-management.test.ts via the DefaultAdapter, so a
 * full migration needs zero Adapter/Executor code. The heavy Adapter+Executor
 * contract is only for the managed/cloud webhook runner, not this path.)
 *
 * Spans are asserted against a real in-process OTLP collector (same harness as
 * tracing-isolation.test.ts), so this proves traces actually EXPORT, not just
 * that a mock was called.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createServer, Server } from "http";
import { AddressInfo } from "net";
import api from "@opentelemetry/api";
import { AgentMarkSDK } from "../agentmark";
import { observe } from "../trace/traced";
import { _resetWarnedForTests } from "../trace/tracing";

// ───────────────────────────────────────────────────────────────────────────
// The user's PRE-EXISTING SDK. Zero AgentMark imports — this stands in for
// `@aws-sdk/client-bedrock-runtime`'s ConverseCommand. AgentMark must remain
// completely agnostic to its shape.
// ───────────────────────────────────────────────────────────────────────────
type BedrockMessage = { role: "user" | "assistant" | "system"; content: string };

class FakeBedrockRuntime {
  public calls: BedrockMessage[][] = [];
  async converse(
    messages: BedrockMessage[],
  ): Promise<{ outputText: string; usage: { inputTokens: number; outputTokens: number } }> {
    this.calls.push(messages);
    const last = messages[messages.length - 1]?.content ?? "";
    const outputText = /refund/i.test(last)
      ? "I've initiated your refund — it lands in 3-5 business days."
      : "Happy to help! Could you share your order number?";
    return { outputText, usage: { inputTokens: 11, outputTokens: 9 } };
  }
}

interface OTLPRequest {
  resourceSpans: Array<{ scopeSpans: Array<{ spans: Array<{ name: string }> }> }>;
}

describe("BYO-SDK migration (raw Bedrock, no adapter/executor)", () => {
  let server: Server;
  let serverUrl: string;
  let received: Array<{ body: OTLPRequest }>;
  let activeSdk: any;

  function exportedSpanNames(): string[] {
    const names: string[] = [];
    for (const req of received) {
      for (const rs of req.body.resourceSpans ?? []) {
        for (const ss of rs.scopeSpans ?? []) {
          for (const sp of ss.spans ?? []) names.push(sp.name);
        }
      }
    }
    return names;
  }

  beforeAll(async () => {
    received = [];
    // Minimal OTLP/HTTP collector — captures whatever AgentMark exports, and
    // also 200s the experiment score POSTs (their bodies are ignored here).
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        try {
          if (body) received.push({ body: JSON.parse(body) });
        } catch {
          /* score POSTs etc. — not OTLP, ignore */
        }
        res.writeHead(200);
        res.end();
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    received.length = 0;
    _resetWarnedForTests();
  });

  afterEach(async () => {
    if (activeSdk) {
      await activeSdk.shutdown();
      activeSdk = null;
    }
    api.trace.disable();
    await new Promise((resolve) => setTimeout(resolve, 200));
  });

  it("traces an arbitrary raw-SDK call via observe() — no adapter needed", async () => {
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a", baseUrl: serverUrl });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const bedrock = new FakeBedrockRuntime();
    // The ONLY change to the user's call site: wrap it in observe().
    const tracedConverse = observe(
      (messages: BedrockMessage[]) => bedrock.converse(messages),
      { name: "bedrock.converse" },
    );

    const result = await tracedConverse([{ role: "user", content: "I want a refund" }]);
    expect(result.outputText).toMatch(/refund/i);

    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // The raw Bedrock call produced a real, exported AgentMark span.
    expect(exportedSpanNames()).toContain("bedrock.converse");
  });

  it("runs a dataset experiment through the raw SDK with evals + gate + per-row spans", async () => {
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a", baseUrl: serverUrl });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const bedrock = new FakeBedrockRuntime();

    // `task` is the user's own code — call Bedrock however they already do.
    // AgentMark drives the dataset, traces each row, runs evals, applies the gate.
    const result = await sdk.runExperiment<{ question: string }, string>({
      experimentKey: "support-agent-quality",
      dataset: [
        { input: { question: "How do I get a refund?" }, expectedOutput: "refund" },
        { input: { question: "Where is my order?" }, expectedOutput: "order" },
      ],
      task: async (input) => {
        const { outputText } = await bedrock.converse([
          { role: "system", content: "You are a support agent." },
          { role: "user", content: input.question },
        ]);
        return outputText;
      },
      evaluators: [
        {
          name: "mentions_expected_topic",
          evaluate: ({ output, expectedOutput }) => {
            const hit = output.toLowerCase().includes(String(expectedOutput).toLowerCase());
            return { score: hit ? 1 : 0, passed: hit };
          },
        },
      ],
      scoreThresholds: { mentions_expected_topic: 1 },
    });

    // Both rows ran through the user's Bedrock call.
    expect(bedrock.calls).toHaveLength(2);
    // The experiment produced a structured, gated result the caller owns.
    expect(result.experimentKey).toBe("support-agent-quality");
    expect(result.passed).toBe(true);

    await activeSdk.forceFlush();
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Each dataset row was traced under the experiment identity.
    const expSpans = exportedSpanNames().filter((n) => n === "support-agent-quality");
    expect(expSpans.length).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a failing eval through the gate (raw-SDK output that misses the bar)", async () => {
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a", baseUrl: serverUrl });
    activeSdk = sdk.initTracing({ disableBatch: true });
    await new Promise((resolve) => setTimeout(resolve, 200));

    const bedrock = new FakeBedrockRuntime();
    const result = await sdk.runExperiment<{ question: string }, string>({
      experimentKey: "support-agent-strict",
      dataset: [{ input: { question: "Where is my order?" }, expectedOutput: "tracking number 12345" }],
      task: async (input) =>
        (await bedrock.converse([{ role: "user", content: input.question }])).outputText,
      evaluators: [
        {
          name: "exact_topic",
          evaluate: ({ output, expectedOutput }) => {
            const hit = output.includes(String(expectedOutput));
            return { score: hit ? 1 : 0, passed: hit };
          },
        },
      ],
      scoreThresholds: { exact_topic: 1 },
    });

    // The model didn't meet the threshold → the gate fails, in the user's process.
    expect(result.passed).toBe(false);
    expect(result.failedScoreThresholds.map((f) => f.scorer)).toContain("exact_topic");
  });
});
