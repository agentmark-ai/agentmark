/**
 * Prompt-version trace linking — agentmarkPromptSpanHook wiring.
 *
 * Pins that the SDK's default prompt span hook forwards BOTH `promptName`
 * (→ `agentmark.prompt_name` attribute, same key the Python SDK emits) and
 * `commitSha` (→ `agentmark.metadata.commit_sha`, exactly like the experiment
 * hook) onto the exported span. The old hook passed only `{ name }`, silently
 * dropping both — these tests fail if either field is dropped again.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import {
  agentmarkPromptSpanHook,
  agentmarkExperimentItemSpanHook,
} from "../span-hooks";
import { AgentMarkSDK } from "../agentmark";
import { findSpanByName, resetCapturedSpans } from "./otlp-memory";

// Route the SDK's OTLP exporter to an in-memory exporter so span export is
// synchronous — no flaky local HTTP collector. See ./otlp-memory for the why.
vi.mock("@opentelemetry/exporter-trace-otlp-http", async () => {
  const { memoryExporter } = await import("./otlp-memory");
  return {
    OTLPTraceExporter: class {
      export(spans: any, resultCallback: any) {
        memoryExporter.export(spans, resultCallback);
      }
      async shutdown() {}
      async forceFlush() {}
    },
  };
});

describe("agentmark span hooks — prompt-version linking", () => {
  let activeSdk: any;

  beforeAll(() => {
    const sdk = new AgentMarkSDK({
      apiKey: "test-key",
      appId: "test-app",
      baseUrl: "http://127.0.0.1:4318",
    });
    activeSdk = sdk.initTracing({ disableBatch: true });
  });

  afterEach(() => {
    resetCapturedSpans();
  });

  afterAll(async () => {
    if (activeSdk) {
      await activeSdk.shutdown();
    }
  });

  async function flushSpans() {
    if (activeSdk?.forceFlush) {
      await activeSdk.forceFlush();
    }
  }

  it("forwards promptName and commitSha onto the prompt-run span", async () => {
    const { result, traceId } = await agentmarkPromptSpanHook(
      { name: "greet-run", promptName: "greet", commitSha: "abc123def456" },
      async (span) => {
        span.setAttribute("agentmark.output", "hi");
        return "done";
      },
    );

    expect(result).toBe("done");
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    await flushSpans();

    const captured = findSpanByName("greet-run");
    expect(captured).not.toBeNull();
    expect(captured!.attrMap.get("agentmark.prompt_name")).toBe("greet");
    expect(captured!.attrMap.get("agentmark.metadata.commit_sha")).toBe(
      "abc123def456",
    );
    expect(captured!.attrMap.get("agentmark.trace_name")).toBe("greet-run");
    expect(captured!.attrMap.get("agentmark.output")).toBe("hi");
  });

  it("omits the commit metadata attribute entirely when commitSha is absent", async () => {
    await agentmarkPromptSpanHook(
      { name: "no-commit-run", promptName: "greet" },
      async () => "ok",
    );
    await flushSpans();

    const captured = findSpanByName("no-commit-run");
    expect(captured).not.toBeNull();
    expect(captured!.attrMap.get("agentmark.prompt_name")).toBe("greet");
    expect(captured!.attrMap.has("agentmark.metadata.commit_sha")).toBe(false);
  });

  it("omits agentmark.prompt_name when promptName is absent", async () => {
    await agentmarkPromptSpanHook({ name: "anonymous-run" }, async () => "ok");
    await flushSpans();

    const captured = findSpanByName("anonymous-run");
    expect(captured).not.toBeNull();
    expect(captured!.attrMap.has("agentmark.prompt_name")).toBe(false);
  });

  it("experiment hook emits promptName + commit_sha the same way (parity)", async () => {
    await agentmarkExperimentItemSpanHook(
      {
        index: 0,
        promptName: "greet",
        datasetRunName: "run-a",
        experimentRunId: "11111111-1111-1111-1111-111111111111",
        datasetItemName: "item-0",
        commitSha: "abc123def456",
      },
      async () => "ok",
    );
    await flushSpans();

    const captured = findSpanByName("experiment-run-a-0");
    expect(captured).not.toBeNull();
    expect(captured!.attrMap.get("agentmark.prompt_name")).toBe("greet");
    expect(captured!.attrMap.get("agentmark.metadata.commit_sha")).toBe(
      "abc123def456",
    );
    expect(captured!.attrMap.get("agentmark.dataset_run_name")).toBe("run-a");
  });
});
