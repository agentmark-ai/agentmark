/**
 * Integration test for the experiment wrapper span (Vercel AI SDK v5 adapter).
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
import { trace as otelTrace, SpanStatusCode } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { computeDatasetItemName } from "@agentmark-ai/prompt-core/webhook-runner";
import { FileLoader } from "@agentmark-ai/loader-file";
import { VercelAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import * as ai from "ai";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// Mock only the LLM call. We deliberately do NOT mock @agentmark-ai/sdk —
// the whole point is to exercise the real span() function.
vi.mock("ai", async () => ({
  jsonSchema: (s: any) => s,
  // The shared executor factory reads `ai.Output` at construction. vitest's
  // strict mock throws on access to undeclared exports, so declare it
  // explicitly (the experimental_output path is never exercised here).
  Output: undefined,
  generateText: vi.fn(async () => ({
    text: "TEXT",
    usage: { totalTokens: 10 },
    finishReason: "stop",
    steps: [],
  })),
  generateObject: vi.fn(async () => ({
    object: { ok: true },
    usage: { totalTokens: 15 },
    finishReason: "stop",
  })),
  experimental_generateImage: vi.fn(async () => ({
    images: [{ mediaType: "image/png", base64: "iVBORw0KGgo=" }],
  })),
  experimental_generateSpeech: vi.fn(async () => ({
    audio: { mediaType: "audio/mpeg", base64: "x", format: "mp3" },
  })),
  streamText: vi.fn(() => ({
    fullStream: (async function* () {
      // v5 stream protocol: `text` field, totalUsage payload on finish.
      yield { type: "text-delta", text: "TEXT" };
      yield { type: "finish", finishReason: "stop", totalUsage: { totalTokens: 10 } };
    })(),
  })),
  streamObject: vi.fn(() => ({
    usage: Promise.resolve({ totalTokens: 15 }),
    fullStream: (async function* () {
      yield { type: "object", object: { ok: true } };
    })(),
  })),
}));

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

function wrapperSpans(): ReadableSpan[] {
  return memoryExporter.getFinishedSpans().filter((s) => s.name.startsWith("experiment-"));
}

// Execution is now PARALLEL via runDatasetPool — completion order is NOT
// dataset read order, so `spans[0]` does NOT necessarily correspond to row 0.
// Derive each span's own index from its name and parse its own
// `agentmark.props` (the JSON dataset input), then assert the item name is the
// content hash of that input at that index. Mirrors the Python
// test_wrapper_span_integration.py approach (hashlib.md5 of sort_keys JSON).
function indexFromSpanName(name: string): number {
  const m = name.match(/-(\d+)$/);
  expect(m, `span name "${name}" must end with -<index>`).not.toBeNull();
  return Number(m![1]);
}

function assertItemNameIsContentHash(span: ReadableSpan): void {
  const index = indexFromSpanName(span.name);
  const propsAttr = span.attributes["agentmark.props"];
  expect(typeof propsAttr).toBe("string");
  const parsedInput = JSON.parse(propsAttr as string);
  expect(span.attributes["agentmark.dataset_item_name"]).toBe(
    computeDatasetItemName(parsedInput, index)
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("experiment wrapper span (real OTel)", () => {
  let runner: VercelAdapterWebhookHandler;
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
    const modelRegistry = new VercelAIModelRegistry();
    modelRegistry.registerModels("test-model", () => ({}) as any);
    const client = createAgentMarkClient({ loader, modelRegistry, evalRegistry: evals });
    runner = new VercelAdapterWebhookHandler(client);
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
    expect(wrapper.name).toMatch(/^experiment-my-experiment-\d+$/);

    const attrs = wrapper.attributes;

    // Core regression: agentmark.input / agentmark.output are the keys
    // AgentMarkTransformer reads. Pre-fix the runner wrote agentmark.props
    // which OtelGenAiTransformer reads but agentmark-scope spans don't
    // route through. Reverting the runner to write props makes this fail
    // with `expect(undefined).toBeDefined()`.
    expect(attrs["agentmark.props"]).toBeDefined();
    expect(attrs["agentmark.output"]).toBeDefined();

    // The mock returns "TEXT" for every row, so output is row-independent.
    expect(attrs["agentmark.output"]).toBe("TEXT");

    // SpanOptions metadata fields — set by the SDK's
    // setAgentmarkAttributes() helper. A regression dropping any field
    // shows up here as a missing key.
    expect(attrs["agentmark.dataset_run_name"]).toBe("my-experiment");
    expect(typeof attrs["agentmark.dataset_run_id"]).toBe("string");
    expect((attrs["agentmark.dataset_run_id"] as string).length).toBeGreaterThan(0);

    // Item name is the content hash of THIS span's own input at its own
    // index — order-robust, unifies with the Python adapters which already
    // emit hashlib.md5-based names. Not a positional index.
    expect(attrs["agentmark.dataset_item_name"]).toMatch(/^[0-9a-f]{12}$/);
    assertItemNameIsContentHash(wrapper);
  });

  it("object experiment wrapper carries agentmark.input/output", async () => {
    // Object path is a separate code branch (generateObject + JSON output);
    // a previous regression fixed only the text path. Cover both.
    (ai as any).generateObject = vi.fn(async () => ({
      object: { ok: true },
      usage: { totalTokens: 1 },
      finishReason: "stop",
    }));
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const { stream } = await runner.runExperiment(ast, "obj-run");
    const rows = await drainStream(stream as ReadableStream);
    expect(rows.length).toBeGreaterThan(0);

    const spans = wrapperSpans();
    expect(spans.length).toBeGreaterThan(0);
    const wrapper = spans[0];
    const attrs = wrapper.attributes;

    expect(attrs["agentmark.props"]).toBeDefined();
    // The mock returns { ok: true } for every row, so output is row-independent.
    expect(attrs["agentmark.output"]).toBe(JSON.stringify({ ok: true }));

    // Order-robust: parallel completion order ≠ read order, so we can't pin to
    // rows[0]. The span's own item name is the content hash of its own input.
    expect(attrs["agentmark.dataset_item_name"]).toMatch(/^[0-9a-f]{12}$/);
    assertItemNameIsContentHash(wrapper);
  });

  it("a failing row records span status ERROR (#2367) while sibling rows still emit dataset chunks", async () => {
    // #2367: the runner THROWS on an executor error event so the wrapper span
    // records ERROR — no green check on a failed run. Make exactly one row's
    // LLM call fail; assert (a) one error chunk + ≥1 dataset chunk (per-row
    // isolation), and (b) exactly one wrapper span has ERROR status while the
    // successful rows do NOT. Reverting the runner's `throw new Error(ev.error)`
    // to a silent error-chunk would leave every span OK and fail this test.
    let calls = 0;
    (ai as any).generateText = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error("ProviderError: row blew up");
      return { text: "TEXT", usage: { totalTokens: 10 }, finishReason: "stop", steps: [] };
    });

    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "fail-run");
    const rows = await drainStream(stream as ReadableStream);

    const errorRows = rows.filter((r) => r.type === "error");
    const datasetRows = rows.filter((r) => r.type === "dataset");
    expect(errorRows).toHaveLength(1); // the one bad row surfaced as an error
    expect(datasetRows.length).toBeGreaterThanOrEqual(1); // siblings survived

    const spans = wrapperSpans();
    const errorSpans = spans.filter((s) => s.status.code === SpanStatusCode.ERROR);
    expect(errorSpans).toHaveLength(1); // exactly the failed row's span is ERROR
    // …and at least one sibling span is NOT error (no false green-check inversion).
    expect(spans.length).toBeGreaterThan(errorSpans.length);
    expect(
      spans.some((s) => s.status.code !== SpanStatusCode.ERROR)
    ).toBe(true);
  });

  it("multi-item dataset emits one wrapper per item, sharing dataset_run_id", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "multi");
    await drainStream(stream as ReadableStream);

    const spans = wrapperSpans().sort((a, b) => a.name.localeCompare(b.name));
    expect(spans.length).toBeGreaterThanOrEqual(2); // text.dataset.jsonl has 3 rows

    // All wrappers share the same dataset_run_id — one experiment, one run.
    const runIds = new Set(spans.map((s) => s.attributes["agentmark.dataset_run_id"]));
    expect(runIds.size).toBe(1);

    // Each wrapper carries the content hash of its OWN input at its OWN index.
    // Order-robust against parallel completion: we derive index + input from
    // each span itself rather than assuming spans[i] === row i.
    for (const span of spans) {
      expect(span.attributes["agentmark.dataset_item_name"]).toMatch(/^[0-9a-f]{12}$/);
      assertItemNameIsContentHash(span);
    }

    // Distinct inputs hash to distinct item names — the property that makes
    // regression-vs-baseline comparison reliable.
    const itemNames = spans.map(
      (s) => s.attributes["agentmark.dataset_item_name"] as string
    );
    expect(new Set(itemNames).size).toBe(itemNames.length);
  });
});
