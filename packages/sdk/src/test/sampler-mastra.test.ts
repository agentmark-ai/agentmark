/**
 * Mastra noise filtering — Issue #1150.
 *
 * Mastra v0's `Agent.generate()` emits ~11 OTel spans per call when telemetry
 * is enabled. The user-meaningful ones (`agent.generate`, `ai.generateText`,
 * `agent.prepareLLMOptions`) are buried under 7 internal getter/converter
 * spans (`agent.getAssignedTools`, `agent.getClientTools`,
 * `agent.getMemoryTools`, `agent.getToolsets`, `agent.getWorkflowTools`,
 * `agent.convertTools`, `agent.formatTools`) that carry no diagnostic value
 * but bloat the trace drawer and ClickHouse storage.
 *
 * This test exercises **real** `@mastra/core/agent` against a real OTel
 * `BasicTracerProvider` configured with our `AgentmarkSampler`. It does not
 * mock Mastra's instrumentation — that is the failure mode the issue
 * describes. If the sampler stops filtering one of the names below, this
 * test breaks.
 *
 * The model is a minimal inline `LanguageModelV1` stub (Mastra v0 ships AI SDK
 * 4 which requires v1 spec). We can't import `MockLanguageModelV2` from
 * `ai/test` because that path transitively imports vitest at the module
 * level, which only works inside the vitest runtime via a different entry.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { trace as otelTrace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { Agent } from "@mastra/core/agent";
import { Mastra } from "@mastra/core";
import { InMemoryStore } from "@mastra/core/storage";
import {
  LegacyStep as Step,
  LegacyWorkflow as Workflow,
} from "@mastra/core/workflows/legacy";
import { z } from "zod";
import { AgentmarkSampler } from "../trace/sampler";

const mockModel = {
  specificationVersion: "v1" as const,
  provider: "mock",
  modelId: "mock-model",
  defaultObjectGenerationMode: "json" as const,
  doGenerate: async () => ({
    text: "Hello!",
    finishReason: "stop" as const,
    usage: { promptTokens: 5, completionTokens: 2 },
    rawCall: { rawPrompt: null, rawSettings: {} },
    warnings: [],
  }),
  doStream: async () => ({
    stream: new ReadableStream(),
    rawCall: { rawPrompt: null, rawSettings: {} },
  }),
};

// Span names captured from a real `agent.generate("hi")` run with telemetry
// on. Anchored here so a future Mastra release that renames one of these
// (e.g. `agent.getAssignedTools` → `agent.tools.getAssigned`) flags via this
// test — at which point the sampler patterns need updating.
const MASTRA_NOISE_NAMES = [
  "agent.getAssignedTools",
  "agent.getClientTools",
  "agent.getMemoryTools",
  "agent.getToolsets",
  "agent.getWorkflowTools",
  "agent.convertTools",
  "agent.formatTools",
] as const;

const MASTRA_SIGNAL_NAMES = [
  "agent.generate",
  "agent.prepareLLMOptions",
  "ai.generateText",
  "ai.generateText.doGenerate",
] as const;

describe("AgentmarkSampler — Mastra noise filtering (real Mastra)", () => {
  let memoryExporter: InMemorySpanExporter;
  let provider: BasicTracerProvider;

  beforeEach(() => {
    memoryExporter = new InMemorySpanExporter();
    provider = new BasicTracerProvider({
      sampler: new AgentmarkSampler(),
      spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
    });
    otelTrace.setGlobalTracerProvider(provider);
  });

  afterEach(async () => {
    await provider.shutdown();
    otelTrace.disable();
  });

  it("drops Mastra internal getter/converter spans but keeps generation + LLM spans", async () => {
    const agent = new Agent({
      name: "test-agent",
      instructions: "You are a test agent.",
      model: mockModel as any,
    });

    await agent.generate("hi", { telemetry: { isEnabled: true } });
    await provider.forceFlush();

    const names = memoryExporter.getFinishedSpans().map((s) => s.name);

    for (const signal of MASTRA_SIGNAL_NAMES) {
      expect(names, `expected signal span ${signal} to be exported`).toContain(signal);
    }
    for (const noise of MASTRA_NOISE_NAMES) {
      expect(names, `expected noise span ${noise} to be filtered`).not.toContain(noise);
    }
  });

  // Reproduces the exact noise pattern from issue #1150's screenshot:
  // a real workflow execution that drowns the actual `workflow.*.execute`
  // span in `mastra.getStorage` (×3), `.persistWorkflowSnapshot` (×3), and
  // friends. Running `new Workflow(...).step(...).commit()` + `.start()` is
  // realistic — it's the minimal version of the weather-workflow tutorial
  // every Mastra user runs as their first non-trivial example.
  it("drops mastra.* orchestrator spans and traceClass storage-proxy spans during a workflow run", async () => {
    const step = new Step({
      id: "double",
      inputSchema: z.object({ value: z.number() }),
      outputSchema: z.object({ result: z.number() }),
      execute: async ({ context }) => ({
        result: (context.inputData?.value ?? 0) * 2,
      }),
    });

    const workflow = new Workflow({
      name: "weather-workflow",
      triggerSchema: z.object({ value: z.number() }),
    });
    workflow.step(step).commit();

    // Cast through any: @mastra/core's `workflows` config and `Run#start`
    // signature target the new (non-legacy) Workflow type. The legacy
    // runtime works fine here — it's purely a type mismatch.
    const mastra = new Mastra({
      storage: new InMemoryStore(),
      workflows: { "weather-workflow": workflow as any },
      telemetry: { enabled: true, serviceName: "test" },
    });

    const run = (mastra.getWorkflow("weather-workflow") as any).createRun();
    await run.start({ triggerData: { value: 21 } });

    // Storage writes are scheduled with setImmediate; let them land.
    await new Promise((r) => setTimeout(r, 200));
    await provider.forceFlush();

    const names = memoryExporter.getFinishedSpans().map((s) => s.name);

    // Signal: the workflow execution itself must survive.
    expect(names).toContain("workflow.weather-workflow.execute");

    // mastra.* prefix is Mastra's top-level orchestrator class — every
    // instrumented method is a getter/setter (getStorage, getWorkflow,
    // setLogger, generateId, …) with no user-meaningful I/O. Drop all of it.
    const mastraOrchestratorSpans = names.filter((n) => n.startsWith("mastra."));
    expect(
      mastraOrchestratorSpans,
      `mastra.* orchestrator spans should be filtered, got: ${JSON.stringify(mastraOrchestratorSpans)}`,
    ).toEqual([]);

    // Spans starting with "." come from `traceClass()` wrapping an instance
    // whose constructor.name is empty/anonymous (the storage proxy). Always
    // internal infrastructure — drop the whole pattern.
    const anonymousProxySpans = names.filter((n) => n.startsWith("."));
    expect(
      anonymousProxySpans,
      `anonymous traceClass proxy spans should be filtered, got: ${JSON.stringify(anonymousProxySpans)}`,
    ).toEqual([]);
  });
});
