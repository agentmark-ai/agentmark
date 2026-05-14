/**
 * Integration test for the experiment wrapper span (Claude Agent SDK v0 adapter, TS).
 *
 * Same shape as the other adapter integration tests — exercises the real
 * chain: runner → @agentmark-ai/sdk's span() → real OTel TracerProvider →
 * exported Span. Asserts on the OTel attributes the dashboard's
 * AgentMarkTransformer actually consumes.
 *
 * Why a separate file from experiment-attributes.test.ts:
 * The existing test uses `vi.mock("@agentmark-ai/sdk")` to replace the
 * SDK's span() function with a stub that records setAttribute calls into
 * a module-scoped array, then asserts on that array. That's a tautology
 * — it tests "the runner called the mock we just installed", not "the
 * span carries the right attribute." This file installs a real
 * BasicTracerProvider + InMemorySpanExporter and reads the actual span.
 *
 * Reverting runner.ts back to write `agentmark.props` (the wrong key for
 * agentmark-scope spans) makes the assertions fail here.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { trace as otelTrace } from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark } from "@agentmark-ai/prompt-core";
import type { ClaudeAgentAdapter } from "../src/adapter";
import type { ClaudeAgentTextParams, ClaudeAgentObjectParams } from "../src/types";

// Mock only the LLM call. We deliberately do NOT mock @agentmark-ai/sdk —
// the whole point is to exercise the real span() function so the test
// reads spans from a real OTel exporter.
const mockQueryResults: Array<any> = [];
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(async function* () {
    for (const result of mockQueryResults) yield result;
  }),
}));

// Frontmatter is read from the AST via getFrontMatter. We supply a
// minimal mock so the tests can swap in different configs per case.
vi.mock("@agentmark-ai/templatedx", () => ({
  getFrontMatter: vi.fn(() => ({})),
}));

vi.mock("@agentmark-ai/prompt-core", () => ({
  createPromptTelemetry: vi.fn(() => ({
    telemetry: { isEnabled: false, promptName: "test" },
  })),
}));

// Import after mocks
import { ClaudeAgentWebhookHandler } from "../src/runner";
import { getFrontMatter } from "@agentmark-ai/templatedx";

// ---------------------------------------------------------------------------
// OTel test harness
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Helpers (lifted verbatim from experiment-attributes.test.ts)
// ---------------------------------------------------------------------------
function createMockAst(): Ast {
  return { type: "root", children: [] };
}

function createMockReadableStream<T>(generator: AsyncGenerator<T>): ReadableStream<T> {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await generator.next();
      if (done) controller.close();
      else controller.enqueue(value);
    },
  });
}

async function drainStream(stream: ReadableStream): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value);
      chunks.push(...text.split("\n").filter((s) => s.trim()));
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

function createMockClient() {
  const mockTextPrompt = {
    format: vi.fn().mockResolvedValue({
      prompt: "test prompt",
      options: { model: "claude-sonnet-4-20250514" },
      messages: [],
    } as ClaudeAgentTextParams),
    formatWithTestProps: vi.fn().mockResolvedValue({
      prompt: "test prompt from test props",
      options: { model: "claude-sonnet-4-20250514" },
      messages: [],
    } as ClaudeAgentTextParams),
    formatWithDataset: vi.fn(),
  };

  const mockObjectPrompt = {
    format: vi.fn().mockResolvedValue({
      prompt: "object prompt",
      options: {
        model: "claude-sonnet-4-20250514",
        outputFormat: { type: "json_schema", schema: {} },
      },
      messages: [],
    } as ClaudeAgentObjectParams),
    formatWithTestProps: vi.fn().mockResolvedValue({
      prompt: "object prompt from test props",
      options: {
        model: "claude-sonnet-4-20250514",
        outputFormat: { type: "json_schema", schema: {} },
      },
      messages: [],
    } as ClaudeAgentObjectParams),
    formatWithDataset: vi.fn(),
  };

  return {
    loadTextPrompt: vi.fn().mockResolvedValue(mockTextPrompt),
    loadObjectPrompt: vi.fn().mockResolvedValue(mockObjectPrompt),
    getLoader: vi.fn().mockReturnValue({}),
    getEvalRegistry: vi.fn().mockReturnValue({}),
    _mockTextPrompt: mockTextPrompt,
    _mockObjectPrompt: mockObjectPrompt,
  } as unknown as AgentMark<
    Record<string, { input: unknown; output: unknown }>,
    ClaudeAgentAdapter<Record<string, { input: unknown; output: unknown }>>
  > & {
    _mockTextPrompt: typeof mockTextPrompt;
    _mockObjectPrompt: typeof mockObjectPrompt;
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("experiment wrapper span (real OTel)", () => {
  let handler: ClaudeAgentWebhookHandler;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults.length = 0;
    installGlobalProvider();
    mockClient = createMockClient();
    handler = new ClaudeAgentWebhookHandler(mockClient);
  });

  afterEach(async () => {
    await teardownGlobalProvider();
  });

  it("text experiment wrapper carries agentmark.input/output and dataset metadata", async () => {
    vi.mocked(getFrontMatter).mockReturnValue({
      name: "experiment-prompt",
      text_config: {},
      test_settings: { dataset: "./test.jsonl" },
    });

    const dataset_input = { question: "What is 2+2?" };
    mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
      createMockReadableStream(
        (async function* () {
          yield {
            formatted: Promise.resolve({
              query: { prompt: "test", options: {} },
              telemetry: { isEnabled: true, promptName: "test" },
              messages: [],
            }),
            dataset: { input: dataset_input, expected_output: "4" },
          };
        })(),
      ),
    );

    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "4",
      usage: { input_tokens: 10, output_tokens: 1 },
    });

    const result = await handler.runExperiment(createMockAst(), "my-experiment");
    await drainStream(result.stream);

    const spans = wrapperSpans();
    expect(spans.length).toBe(1);
    const wrapper = spans[0];

    // Tracer scope must be "agentmark" — determines normalizer routing.
    // OTel-JS exposes both `instrumentationScope` (current) and
    // `instrumentationLibrary` (legacy alias); accept whichever the
    // resolved sdk-trace-base happens to populate so the test is robust
    // against minor SDK upgrades.
    const scope =
      (wrapper as any).instrumentationScope ??
      (wrapper as any).instrumentationLibrary;
    expect(scope?.name).toBe("agentmark");
    expect(wrapper.name).toBe("experiment-my-experiment-0");

    const attrs = wrapper.attributes;
    // Core regression: pre-fix the runner wrote agentmark.props (a key
    // the agentmark-scope transformer doesn't read), producing empty
    // I/O panels in the trace drawer. Reverting to props makes this fail.
    expect(attrs["agentmark.props"]).toBe(JSON.stringify(dataset_input));
    expect(attrs["agentmark.output"]).toBe("4");

    // SpanOptions metadata fields — set by setAgentmarkAttributes.
    expect(attrs["agentmark.dataset_run_name"]).toBe("my-experiment");
    expect(typeof attrs["agentmark.dataset_run_id"]).toBe("string");
    expect((attrs["agentmark.dataset_run_id"] as string).length).toBeGreaterThan(0);
    // Item name is a content-hashed identifier (computeDatasetItemName) —
    // first 12 hex chars of MD5(canonical-JSON(dataset_input)). Verifying the
    // format here pins that the runner is no longer writing the positional
    // index, while leaving the specific hash undeclared so input-shape edits
    // in this test don't cascade.
    expect(attrs["agentmark.dataset_item_name"]).toMatch(/^[0-9a-f]{12}$/);
  });

  it("object experiment wrapper carries agentmark.input/output", async () => {
    vi.mocked(getFrontMatter).mockReturnValue({
      name: "experiment-prompt",
      object_config: {},
      test_settings: { dataset: "./test.jsonl" },
    });

    const structuredOutput = { answer: 42 };
    const dataset_input = { question: "What is 6*7?" };
    mockClient._mockObjectPrompt.formatWithDataset.mockReturnValue(
      createMockReadableStream(
        (async function* () {
          yield {
            formatted: Promise.resolve({
              query: { prompt: "test", options: {} },
              telemetry: { isEnabled: true, promptName: "test" },
              messages: [],
            }),
            dataset: { input: dataset_input, expected_output: JSON.stringify(structuredOutput) },
          };
        })(),
      ),
    );

    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "",
      structured_output: structuredOutput,
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await handler.runExperiment(createMockAst(), "obj-run");
    await drainStream(result.stream);

    const spans = wrapperSpans();
    expect(spans.length).toBe(1);
    const attrs = spans[0].attributes;

    expect(attrs["agentmark.props"]).toBe(JSON.stringify(dataset_input));
    expect(attrs["agentmark.output"]).toBe(JSON.stringify(structuredOutput));
  });

  it("multi-item dataset emits one wrapper per item, sharing dataset_run_id", async () => {
    vi.mocked(getFrontMatter).mockReturnValue({
      name: "experiment-prompt",
      text_config: {},
      test_settings: { dataset: "./test.jsonl" },
    });

    const items = [
      { input: { q: "first" }, expected_output: "a1" },
      { input: { q: "second" }, expected_output: "a2" },
    ];
    mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
      createMockReadableStream(
        (async function* () {
          for (const it of items) {
            yield {
              formatted: Promise.resolve({
                query: { prompt: "test", options: {} },
                telemetry: { isEnabled: true, promptName: "test" },
                messages: [],
              }),
              dataset: it,
            };
          }
        })(),
      ),
    );

    // The mocked query yields the same result for every iteration —
    // sufficient to verify per-item wrapper emission. The output value
    // doesn't carry semantic load here.
    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "answer",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "answer",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await handler.runExperiment(createMockAst(), "multi");
    await drainStream(result.stream);

    const spans = wrapperSpans().sort((a, b) => a.name.localeCompare(b.name));
    expect(spans.map((s) => s.name)).toEqual([
      "experiment-multi-0",
      "experiment-multi-1",
    ]);

    // All wrappers share one dataset_run_id — one experiment, one run.
    const runIds = new Set(spans.map((s) => s.attributes["agentmark.dataset_run_id"]));
    expect(runIds.size).toBe(1);

    // Per-item input/output is set on each wrapper.
    expect(spans[0].attributes["agentmark.props"]).toBe(JSON.stringify({ q: "first" }));
    expect(spans[1].attributes["agentmark.props"]).toBe(JSON.stringify({ q: "second" }));
  });
});
