import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark } from "@agentmark-ai/prompt-core";
import type { ClaudeAgentAdapter } from "../src/adapter";
import type { ClaudeAgentTextParams, ClaudeAgentObjectParams } from "../src/types";

// Track setAttribute calls on experiment wrapper spans
const setAttributeCalls: Array<{ key: string; value: string | number | boolean }> = [];

// Mock the claude-agent-sdk query function
const mockQueryResults: Array<any> = [];
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(async function* () {
    for (const result of mockQueryResults) {
      yield result;
    }
  }),
}));

// Mock getFrontMatter and createPromptTelemetry
vi.mock("@agentmark-ai/templatedx", () => ({
  getFrontMatter: vi.fn(() => ({})),
}));

vi.mock("@agentmark-ai/prompt-core", () => ({
  createPromptTelemetry: vi.fn(() => ({
    telemetry: { isEnabled: false, promptName: "test" },
  })),
}));

vi.mock("@agentmark-ai/sdk", () => ({
  span: vi.fn(async (options: any, fn: any) => {
    const ctx = {
      traceId: "test-trace-id",
      spanId: "test-span-id",
      setAttribute: vi.fn((key: string, value: string | number | boolean) => {
        setAttributeCalls.push({ key, value });
      }),
      addEvent: vi.fn(),
      setInput: vi.fn(),
      setOutput: vi.fn(),
      span: vi.fn(),
    };
    const result = await fn(ctx);
    return { result: Promise.resolve(result), traceId: "test-trace-id" };
  }),
}));

// Import after mocks
import { ClaudeAgentWebhookHandler } from "../src/runner";
import { getFrontMatter } from "@agentmark-ai/templatedx";

// Helper to create mock AST
function createMockAst(): Ast {
  return { type: "root", children: [] };
}

// Helper to create a mock ReadableStream from an async generator
function createMockReadableStream<T>(generator: AsyncGenerator<T>): ReadableStream<T> {
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await generator.next();
      if (done) {
        controller.close();
      } else {
        controller.enqueue(value);
      }
    },
  });
}

// Helper to drain a ReadableStream and collect chunks
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

// Helper to create mock client
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
    getEvalRegistry: vi.fn().mockReturnValue(undefined),
    getScoreRegistry: vi.fn().mockReturnValue({}),
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

describe("runExperiment sets agentmark.props and agentmark.output on wrapper span", () => {
  let handler: ClaudeAgentWebhookHandler;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults.length = 0;
    setAttributeCalls.length = 0;
    mockClient = createMockClient();
    handler = new ClaudeAgentWebhookHandler(mockClient);
  });

  it("sets agentmark.props and agentmark.output for text_config experiments", async () => {
    vi.mocked(getFrontMatter).mockReturnValue({
      name: "experiment-prompt",
      text_config: {},
      test_settings: { dataset: "./test.jsonl" },
    });

    mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
      createMockReadableStream(
        (async function* () {
          yield {
            formatted: Promise.resolve({
              query: { prompt: "test", options: {} },
              telemetry: { isEnabled: true, promptName: "test" },
              messages: [],
            }),
            dataset: { input: { question: "What is 2+2?" }, expected_output: "4" },
          };
        })()
      )
    );

    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "4",
      usage: { input_tokens: 10, output_tokens: 1 },
    });

    const result = await handler.runExperiment(createMockAst(), "run-1");
    const chunks = await drainStream(result.stream);
    const parsed = chunks.map((c) => JSON.parse(c));
    const datasetEvents = parsed.filter((p) => p.type === "dataset");

    expect(datasetEvents).toHaveLength(1);

    // Check agentmark.props was set with the dataset input
    const propsAttrs = setAttributeCalls.filter(c => c.key === "agentmark.props");
    expect(propsAttrs.length).toBeGreaterThan(0);
    expect(propsAttrs[0].value).toBe(JSON.stringify({ question: "What is 2+2?" }));

    // Check agentmark.output was set with the model output
    const outputAttrs = setAttributeCalls.filter(c => c.key === "agentmark.output");
    expect(outputAttrs.length).toBeGreaterThan(0);
    expect(outputAttrs[0].value).toBe("4");
  });

  it("sets agentmark.props and agentmark.output for object_config experiments", async () => {
    vi.mocked(getFrontMatter).mockReturnValue({
      name: "experiment-prompt",
      object_config: {},
      test_settings: { dataset: "./test.jsonl" },
    });

    const structuredOutput = { answer: 42 };
    mockClient._mockObjectPrompt.formatWithDataset.mockReturnValue(
      createMockReadableStream(
        (async function* () {
          yield {
            formatted: Promise.resolve({
              query: { prompt: "test", options: {} },
              telemetry: { isEnabled: true, promptName: "test" },
              messages: [],
            }),
            dataset: { input: { question: "What is 6*7?" }, expected_output: JSON.stringify(structuredOutput) },
          };
        })()
      )
    );

    mockQueryResults.push({
      type: "result",
      subtype: "success",
      result: "",
      structured_output: structuredOutput,
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await handler.runExperiment(createMockAst(), "run-1");
    const chunks = await drainStream(result.stream);
    const parsed = chunks.map((c) => JSON.parse(c));
    const datasetEvents = parsed.filter((p) => p.type === "dataset");

    expect(datasetEvents).toHaveLength(1);

    const propsAttrs = setAttributeCalls.filter(c => c.key === "agentmark.props");
    expect(propsAttrs.length).toBeGreaterThan(0);
    expect(propsAttrs[0].value).toBe(JSON.stringify({ question: "What is 6*7?" }));

    const outputAttrs = setAttributeCalls.filter(c => c.key === "agentmark.output");
    expect(outputAttrs.length).toBeGreaterThan(0);
    expect(outputAttrs[0].value).toBe(JSON.stringify(structuredOutput));
  });
});
