/**
 * Integration test for the experiment wrapper span (Mastra v0 adapter).
 *
 * Same shape as the Python integration tests
 * (pydantic-ai-v0-adapter/tests/test_wrapper_span_integration.py and
 * claude-agent-sdk-v0-adapter-python/tests/test_wrapper_span_integration.py):
 * exercises the real chain — runner → @agentmark-ai/sdk's span() → real
 * OTel TracerProvider → exported Span. Asserts on the OTel attributes the
 * dashboard's AgentMarkTransformer actually consumes.
 *
 * Why a separate file from experiment-attributes.test.ts:
 * The existing test uses `vi.mock("@agentmark-ai/sdk")` to replace the
 * SDK's span() function with a stub that records setAttribute calls into
 * a module-scoped array, then asserts on that array. That's a tautology
 * — it tests "the runner called the mock we just installed", not "the
 * span carries the right attribute." The same family of tests in the
 * Python adapters passed while the wrapper-span bug shipped to
 * production. This file installs a real BasicTracerProvider + an
 * InMemorySpanExporter and reads the actual exported span.
 *
 * If anyone reverts runner.ts to write `agentmark.props` instead of
 * `agentmark.input`, this test fails — same failure mode the live trace
 * drawer exhibits.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import { trace as otelTrace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { MastraAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import { createAgentMarkClient, MastraModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock only the Mastra Agent's generate/stream surface. We deliberately
// do NOT mock @agentmark-ai/sdk — the whole point is to exercise the
// real span() function so the test reads spans from a real OTel exporter.
vi.mock("@mastra/core/agent", () => {
  const mockGenerate = vi.fn(async (_messages: any, _options?: any) => {
    if (_options?.output) {
      return {
        object: { answer: "8" },
        usage: { totalTokens: 15 },
        finishReason: "stop",
      };
    }
    return {
      text: "TEXT",
      usage: { totalTokens: 10 },
      finishReason: "stop",
      toolCalls: [],
      toolResults: [],
    };
  });

  const mockStream = vi.fn(async (_messages: any, _options?: any) => {
    if (_options?.output) {
      return {
        usage: Promise.resolve({ totalTokens: 15 }),
        fullStream: (async function* () {
          yield { type: "object", object: { answer: "8" } };
        })(),
      };
    }
    return {
      fullStream: (async function* () {
        yield { type: "text-delta", textDelta: "TEXT" };
        yield { type: "finish", finishReason: "stop", usage: { totalTokens: 10 } };
      })(),
    };
  });

  return {
    Agent: class MockAgent {
      generate = mockGenerate;
      stream = mockStream;
    },
  };
});

// ---------------------------------------------------------------------------
// OTel test harness
// ---------------------------------------------------------------------------
// @agentmark-ai/sdk's getAgentmarkTracer() falls back to the global tracer
// provider when initTracing() hasn't been called. We register our own
// provider as the global so span() emits into our InMemorySpanExporter.
let memoryExporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

function installGlobalProvider() {
  memoryExporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
  });
  otelTrace.setGlobalTracerProvider(provider);
}

async function teardownGlobalProvider() {
  await provider.shutdown();
  otelTrace.disable();
}

// Mastra's runner names the wrapper span `ds-run-${datasetRunName}-${index}`
// (see src/runner.ts:341 / :460). Other adapters use `experiment-…`. Pin
// the prefix here so a future rename can't silently make the filter empty.
function wrapperSpans(): ReadableSpan[] {
  return memoryExporter.getFinishedSpans().filter((s) => s.name.startsWith("ds-run-"));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("experiment wrapper span (real OTel)", () => {
  let runner: MastraAdapterWebhookHandler;
  let loader: FileLoader;

  beforeAll(async () => {
    await setupFixtures();
  });

  afterAll(() => {
    cleanupFixtures();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    installGlobalProvider();

    const evals: EvalRegistry = {
      exact_match: async ({ output, expectedOutput }) => {
        const out = typeof output === "string" ? output : JSON.stringify(output);
        const exp =
          typeof expectedOutput === "string" ? expectedOutput : JSON.stringify(expectedOutput);
        const isMatch = out === exp;
        return {
          score: isMatch ? 1 : 0,
          label: isMatch ? "correct" : "incorrect",
          reason: "",
          passed: isMatch,
        };
      },
    };

    const base = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
    loader = new FileLoader(base);
    const modelRegistry = new MastraModelRegistry();
    modelRegistry.registerModels("test-model", () => ({
      name: "test-model",
      generate: vi.fn(),
    }) as any);
    const client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });
    runner = new MastraAdapterWebhookHandler(client);
  });

  afterEach(async () => {
    await teardownGlobalProvider();
    vi.restoreAllMocks();
  });

  async function drainStream(stream: ReadableStream): Promise<any[]> {
    const reader = stream.getReader();
    const rows: any[] = [];
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const line = typeof value === "string" ? value : new TextDecoder().decode(value);
      const trimmed = line.trim();
      if (trimmed) rows.push(JSON.parse(trimmed));
    }
    return rows;
  }

  it("text experiment wrapper carries agentmark.input/output and dataset metadata", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "my-experiment");
    const rows = await drainStream(stream as ReadableStream);
    expect(rows.length).toBeGreaterThan(0);

    const spans = wrapperSpans();
    expect(spans.length).toBeGreaterThan(0);
    const wrapper = spans[0];

    // Tracer scope must be "agentmark" — determines which transformer
    // routes this span in the dashboard normalizer. If scope changes,
    // the I/O-key contract changes too. Pin it explicitly.
    expect(wrapper.instrumentationScope.name).toBe("agentmark");

    // Span name carries the iteration index — used in trace drawer headers.
    expect(wrapper.name).toMatch(/^ds-run-my-experiment-\d+$/);

    const attrs = wrapper.attributes;

    // Core regression: agentmark.input / agentmark.output are the keys
    // AgentMarkTransformer reads. Pre-fix the runner wrote agentmark.props
    // which OtelGenAiTransformer reads but agentmark-scope spans don't
    // route through. Reverting the runner to write props makes this fail
    // with `expect(undefined).toBeDefined()`.
    expect(attrs["agentmark.props"]).toBeDefined();
    expect(attrs["agentmark.output"]).toBeDefined();

    // Input is the JSON-stringified dataset input.
    const firstInput = rows[0]?.result?.input;
    expect(attrs["agentmark.props"]).toBe(JSON.stringify(firstInput));
    expect(attrs["agentmark.output"]).toBe("TEXT");

    // SpanOptions metadata fields — set by the SDK's
    // setAgentmarkAttributes() helper. A regression dropping any field
    // shows up here as a missing key.
    expect(attrs["agentmark.dataset_run_name"]).toBe("my-experiment");
    expect(typeof attrs["agentmark.dataset_run_id"]).toBe("string");
    expect((attrs["agentmark.dataset_run_id"] as string).length).toBeGreaterThan(0);
    // Item name is a content-hashed identifier (computeDatasetItemName) —
    // first 12 hex chars of MD5(canonical-JSON(dataset_input)). Pinning the
    // format here guards against regressing to positional indices.
    expect(attrs["agentmark.dataset_item_name"]).toMatch(/^[0-9a-f]{12}$/);
  });

  it("object experiment wrapper carries agentmark.input/output", async () => {
    // Object path is a separate code branch (output: schema → JSON);
    // a previous regression fixed only the text path. Cover both.
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const { stream } = await runner.runExperiment(ast, "obj-run");
    const rows = await drainStream(stream as ReadableStream);
    expect(rows.length).toBeGreaterThan(0);

    const spans = wrapperSpans();
    expect(spans.length).toBeGreaterThan(0);
    const attrs = spans[0].attributes;

    expect(attrs["agentmark.props"]).toBeDefined();
    // The Mastra mock returns { answer: "8" } for object prompts.
    expect(attrs["agentmark.output"]).toBe(JSON.stringify({ answer: "8" }));
    const firstInput = rows[0]?.result?.input;
    expect(attrs["agentmark.props"]).toBe(JSON.stringify(firstInput));
  });

  it("multi-item dataset emits one wrapper per item, sharing dataset_run_id", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "multi");
    await drainStream(stream as ReadableStream);

    const spans = wrapperSpans().sort((a, b) => a.name.localeCompare(b.name));
    expect(spans.length).toBeGreaterThanOrEqual(2); // text.dataset.jsonl has 2 rows

    // All wrappers share the same dataset_run_id — one experiment, one run.
    const runIds = new Set(spans.map((s) => s.attributes["agentmark.dataset_run_id"]));
    expect(runIds.size).toBe(1);

    // Each wrapper gets its own content-hashed item name. We assert
    // (a) the format (12-char hex), and (b) uniqueness across distinct
    // rows — the property that makes regression-vs-baseline comparison
    // reliable. We deliberately don't pin the specific hash values so that
    // edits to the fixture dataset don't cascade-break the assertion.
    const itemNames = spans.map(
      (s) => s.attributes["agentmark.dataset_item_name"] as string
    );
    for (const name of itemNames) {
      expect(name).toMatch(/^[0-9a-f]{12}$/);
    }
    expect(new Set(itemNames).size).toBe(itemNames.length);
  });
});
