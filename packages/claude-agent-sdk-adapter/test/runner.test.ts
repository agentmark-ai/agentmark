import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark } from "@agentmark-ai/prompt-core";
import type { ClaudeAgentAdapter } from "../src/adapter";
import type { ClaudeAgentTextParams, ClaudeAgentObjectParams } from "../src/types";

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

// Import after mocks
import { ClaudeAgentWebhookHandler } from "../src/runner";
import { getFrontMatter } from "@agentmark-ai/templatedx";
import { query } from "@anthropic-ai/claude-agent-sdk";

// Helper to create mock AST
function createMockAst(): Ast {
  return { type: "root", children: [] };
}

// Helper to create mock AgentMark client
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
    getEvalRegistry: vi.fn().mockReturnValue(undefined),
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
      // Split by newlines and filter empty
      chunks.push(...text.split("\n").filter((s) => s.trim()));
    }
  } finally {
    reader.releaseLock();
  }

  return chunks;
}

describe("ClaudeAgentWebhookHandler", () => {
  let handler: ClaudeAgentWebhookHandler;
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryResults.length = 0;
    mockClient = createMockClient();
    handler = new ClaudeAgentWebhookHandler(mockClient);
  });

  describe("constructor", () => {
    it("should initialize with client", () => {
      const client = createMockClient();
      const h = new ClaudeAgentWebhookHandler(client);
      expect(h).toBeInstanceOf(ClaudeAgentWebhookHandler);
    });
  });

  describe("runPrompt", () => {
    describe("text prompts", () => {
      beforeEach(() => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "test-prompt",
          text_config: { model_name: "claude-sonnet-4-20250514" },
        });
      });

      it("should execute text prompt and return response", async () => {
        mockQueryResults.push({
          type: "assistant",
          message: { content: [{ type: "text", text: "Hello" }] },
        });
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Final answer",
          usage: { input_tokens: 10, output_tokens: 5 },
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.type).toBe("text");
        expect(result.result).toBe("Final answer");
        expect(result.usage).toEqual({
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        });
      });

      it("should use formatWithTestProps when no custom props", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Done",
        });

        await handler.runPrompt(createMockAst());

        expect(mockClient._mockTextPrompt.formatWithTestProps).toHaveBeenCalled();
        expect(mockClient._mockTextPrompt.format).not.toHaveBeenCalled();
      });

      it("should use format when custom props provided", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Done",
        });

        await handler.runPrompt(createMockAst(), {
          customProps: { userMessage: "Hello" },
        });

        expect(mockClient._mockTextPrompt.format).toHaveBeenCalledWith(
          expect.objectContaining({
            props: { userMessage: "Hello" },
          })
        );
      });

      it("should set finishReason to stop on success", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Done",
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.finishReason).toBe("stop");
      });

      it("should set finishReason to error on failure", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "error_during_execution",
          errors: ["Something went wrong"],
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.finishReason).toBe("error");
        expect(result.result).toContain("Something went wrong");
      });

      it("should include traceId in result", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Done",
        });

        const result = await handler.runPrompt(createMockAst());

        // traceId is now generated by withTracing() wrapper (32-char hex string)
        expect(result.traceId).toBeDefined();
        expect(typeof result.traceId).toBe("string");
        expect(result.traceId.length).toBe(32);
      });
    });

    describe("object prompts", () => {
      beforeEach(() => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "object-prompt",
          object_config: {
            model_name: "claude-sonnet-4-20250514",
            output: { schema: { type: "object" } },
          },
        });
      });

      it("should execute object prompt with structured output", async () => {
        const structuredOutput = { answer: 42, reasoning: "test" };
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "",
          structured_output: structuredOutput,
          usage: { input_tokens: 20, output_tokens: 10 },
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.type).toBe("object");
        expect(result.result).toEqual(structuredOutput);
      });

      it("should use formatWithTestProps for object prompts without custom props", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          structured_output: {},
        });

        await handler.runPrompt(createMockAst());

        expect(mockClient._mockObjectPrompt.formatWithTestProps).toHaveBeenCalled();
      });
    });

    describe("unsupported prompt types", () => {
      it("should return error for image_config prompts", async () => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "image-prompt",
          image_config: { model_name: "dall-e-3" },
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.type).toBe("text");
        expect(result.result).toContain("Image generation is not supported");
        expect(result.finishReason).toBe("error");
        expect(result.usage?.totalTokens).toBe(0);
      });

      it("should return error for speech_config prompts", async () => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "speech-prompt",
          speech_config: { model_name: "tts-1", voice: "alloy" },
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.type).toBe("text");
        expect(result.result).toContain("Speech generation is not supported");
        expect(result.finishReason).toBe("error");
      });

      it("should throw for unrecognized config types", async () => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "unknown-prompt",
        });

        await expect(handler.runPrompt(createMockAst())).rejects.toThrow(
          "Invalid prompt: No recognized config type"
        );
      });
    });

    describe("error handling", () => {
      beforeEach(() => {
        vi.mocked(getFrontMatter).mockReturnValue({
          name: "test",
          text_config: {},
        });
      });

      it("should handle query errors gracefully", async () => {
        // eslint-disable-next-line require-yield -- Testing error thrown before any yield
        vi.mocked(query).mockImplementationOnce(async function* () {
          throw new Error("Network error");
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.finishReason).toBe("error");
        expect(result.result).toContain("Network error");
      });

      it("should handle error_max_turns subtype", async () => {
        mockQueryResults.push({
          type: "result",
          subtype: "error_max_turns",
          errors: ["Max turns exceeded"],
        });

        const result = await handler.runPrompt(createMockAst());

        expect(result.finishReason).toBe("error");
        expect(result.result).toContain("Max turns exceeded");
      });

      it("should include traceId even when prompt name is missing", async () => {
        vi.mocked(getFrontMatter).mockReturnValue({
          text_config: {},
        });
        mockQueryResults.push({
          type: "result",
          subtype: "success",
          result: "Done",
        });

        const result = await handler.runPrompt(createMockAst());

        // traceId is now generated by withTracing() wrapper (32-char hex string)
        expect(result.traceId).toBeDefined();
        expect(typeof result.traceId).toBe("string");
        expect(result.traceId.length).toBe(32);
      });
    });
  });

  describe("streaming responses", () => {
    beforeEach(() => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "stream-test",
        text_config: {},
      });
    });

    it("should create ReadableStream when shouldStream=true", async () => {
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      expect(result.type).toBe("stream");
      expect(result.stream).toBeInstanceOf(ReadableStream);
    });

    it("should yield assistant messages with content", async () => {
      mockQueryResults.push({
        type: "assistant",
        message: { content: [{ type: "text", text: "Hello " }] },
      });
      mockQueryResults.push({
        type: "assistant",
        message: { content: [{ type: "text", text: "World" }] },
      });
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Final",
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      const chunks = await drainStream(result.stream!);
      const parsed = chunks.map((c) => JSON.parse(c));

      // Should have delta chunks for assistant messages plus final result
      const deltas = parsed.filter((p) => p.delta);
      expect(deltas).toHaveLength(2);
      expect(deltas[0].delta).toBe("Hello ");
      expect(deltas[1].delta).toBe("World");
    });

    it("should accumulate token usage across messages", async () => {
      mockQueryResults.push({
        type: "assistant",
        message: { content: [{ type: "text", text: "Test" }] },
      });
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
        usage: { input_tokens: 100, output_tokens: 50 },
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      const chunks = await drainStream(result.stream!);
      const parsed = chunks.map((c) => JSON.parse(c));
      const final = parsed.find((p) => p.finishReason);

      expect(final.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
      });
    });

    it("should capture structured output from result", async () => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "object-stream",
        object_config: { model_name: "claude-sonnet" },
      });

      const structuredOutput = { key: "value" };
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        structured_output: structuredOutput,
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      const chunks = await drainStream(result.stream!);
      const parsed = chunks.map((c) => JSON.parse(c));
      const final = parsed.find((p) => p.finishReason);

      expect(final.result).toEqual(structuredOutput);
    });

    it("should handle result with error subtype", async () => {
      mockQueryResults.push({
        type: "result",
        subtype: "error_during_execution",
        errors: ["Execution failed"],
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      const chunks = await drainStream(result.stream!);
      const parsed = chunks.map((c) => JSON.parse(c));
      const errorChunk = parsed.find((p) => p.type === "error");

      expect(errorChunk).toBeDefined();
      expect(errorChunk.error).toContain("Execution failed");
    });

    it("should handle missing message.content", async () => {
      mockQueryResults.push({
        type: "assistant",
        message: {}, // No content
      });
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      // Should not throw
      const chunks = await drainStream(result.stream!);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should close stream on completion", async () => {
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      // Draining should complete without hanging
      await drainStream(result.stream!);
    });

    it("should handle errors during streaming", async () => {
      vi.mocked(query).mockImplementationOnce(async function* () {
        yield { type: "assistant", message: { content: [{ type: "text", text: "Start" }] } };
        throw new Error("Stream interrupted");
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      const chunks = await drainStream(result.stream!);
      const parsed = chunks.map((c) => JSON.parse(c));
      const errorChunk = parsed.find((p) => p.type === "error");

      expect(errorChunk).toBeDefined();
      expect(errorChunk.error).toContain("Stream interrupted");
    });

    it("should include stream header", async () => {
      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runPrompt(createMockAst(), {
        shouldStream: true,
      });

      expect(result.streamHeader).toEqual({ "AgentMark-Streaming": "true" });
    });
  });

  describe("runExperiment", () => {
    beforeEach(() => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "experiment-prompt",
        text_config: {},
        test_settings: { dataset: "./test.jsonl" },
      });
    });

    it("should emit error when no dataset configured", async () => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "no-dataset-prompt",
        text_config: {},
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      expect(parsed[0].type).toBe("error");
      expect(parsed[0].error).toContain("No dataset path provided");
    });

    it("should use provided dataset path over frontmatter", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            // Empty iterator
          })()
        )
      );

      const result = await handler.runExperiment(
        createMockAst(),
        "run-1",
        "./override.jsonl"
      );

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const startEvent = parsed.find((p) => p.type === "experiment_start");

      expect(startEvent.datasetPath).toBe("./override.jsonl");
    });

    it("should emit experiment metadata at start", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            // Empty iterator
          })()
        )
      );

      const result = await handler.runExperiment(createMockAst(), "my-run");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      expect(parsed[0]).toEqual({
        type: "experiment_start",
        runId: expect.any(String),
        runName: "my-run",
        datasetPath: "./test.jsonl",
        promptName: "experiment-prompt",
      });
      // Verify runId is a UUID format
      expect(parsed[0].runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should iterate through all dataset items", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "p1", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { q: "a" }, expected_output: "A" },
            };
            yield {
              formatted: Promise.resolve({ query: { prompt: "p2", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { q: "b" }, expected_output: "B" },
            };
          })()
        )
      );

      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Response",
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const itemEvents = parsed.filter((p) => p.type === "dataset");

      expect(itemEvents).toHaveLength(2);
    });

    it("should emit result for each item with input/output/expected", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
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
      const itemEvent = parsed.find((p) => p.type === "dataset");

      expect(itemEvent).toEqual({
        type: "dataset",
        result: {
          input: { question: "What is 2+2?" },
          expectedOutput: "4",
          actualOutput: "4",
          tokens: 11,
          evals: [],
        },
        traceId: expect.any(String),
        runId: expect.any(String),
        runName: "run-1",
      });
      // Verify runId is a UUID format
      expect(itemEvent.runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should include tokens in item results", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: "" },
            };
          })()
        )
      );

      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "result",
        usage: { input_tokens: 50, output_tokens: 25 },
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const itemEvent = parsed.find((p) => p.type === "dataset");

      expect(itemEvent.result.tokens).toBe(75);
    });

    it("should handle item execution errors gracefully", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { q: "test" }, expected_output: "" },
            };
          })()
        )
      );

      // eslint-disable-next-line require-yield -- Testing error thrown before any yield
      vi.mocked(query).mockImplementationOnce(async function* () {
        throw new Error("Item execution failed");
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const errorEvent = parsed.find((p) => p.type === "experiment_item_error");

      expect(errorEvent).toBeDefined();
      expect(errorEvent.error).toContain("Item execution failed");
      expect(errorEvent.input).toEqual({ q: "test" });
    });

    it("should continue after item errors", async () => {
      let callCount = 0;
      vi.mocked(query).mockImplementation(async function* () {
        callCount++;
        if (callCount === 1) {
          throw new Error("First item failed");
        }
        yield {
          type: "result",
          subtype: "success",
          result: "Second item succeeded",
        };
      });

      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "p1", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { i: 1 }, expected_output: "1" },
            };
            yield {
              formatted: Promise.resolve({ query: { prompt: "p2", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { i: 2 }, expected_output: "2" },
            };
          })()
        )
      );

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      const errorEvent = parsed.find((p) => p.type === "experiment_item_error");
      const successEvent = parsed.find((p) => p.type === "dataset");
      const endEvent = parsed.find((p) => p.type === "experiment_end");

      expect(errorEvent).toBeDefined();
      expect(successEvent).toBeDefined();
      expect(endEvent.totalItems).toBe(2);
    });

    it("should emit completion event", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: "" },
            };
          })()
        )
      );

      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const endEvent = parsed.find((p) => p.type === "experiment_end");

      expect(endEvent).toEqual({
        type: "experiment_end",
        totalItems: 1,
      });
    });

    it("should reject image prompts in experiments", async () => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "image-experiment",
        image_config: { model_name: "dall-e-3" },
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      expect(parsed[0].type).toBe("error");
      expect(parsed[0].error).toContain("not supported");
    });

    it("should reject speech prompts in experiments", async () => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "speech-experiment",
        speech_config: { model_name: "tts-1" },
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      expect(parsed[0].type).toBe("error");
      expect(parsed[0].error).toContain("not supported");
    });

    it("should handle dataset error chunks", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield { error: "Invalid JSON at line 3" };
            yield {
              formatted: Promise.resolve({ query: { prompt: "valid", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: "" },
            };
          })()
        )
      );

      mockQueryResults.push({
        type: "result",
        subtype: "success",
        result: "Done",
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const errorEvents = parsed.filter((p) => p.type === "experiment_item_error");
      const successEvents = parsed.filter((p) => p.type === "dataset");

      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].error).toBe("Invalid JSON at line 3");
      expect(successEvents).toHaveLength(1);
    });

    it("should use object prompt for object_config", async () => {
      vi.mocked(getFrontMatter).mockReturnValue({
        name: "object-experiment",
        object_config: { model_name: "claude-sonnet", output: {} },
        test_settings: { dataset: "./test.jsonl" },
      });

      mockClient._mockObjectPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: { result: true } },
            };
          })()
        )
      );

      // Use custom implementation for this test
      vi.mocked(query).mockImplementationOnce(async function* () {
        yield {
          type: "result",
          subtype: "success",
          structured_output: { result: true },
        };
      });

      const result = await handler.runExperiment(createMockAst(), "run-1");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));
      const itemEvent = parsed.find((p) => p.type === "dataset");

      expect(mockClient.loadObjectPrompt).toHaveBeenCalled();
      expect(itemEvent.result.actualOutput).toEqual({ result: true });
    });

    it("should include streaming headers in response", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            // Empty
          })()
        )
      );

      const result = await handler.runExperiment(createMockAst(), "run-1");

      expect(result.streamHeaders).toEqual({ "AgentMark-Streaming": "true" });
    });

    it("should use consistent runId (UUID) across all events in a single experiment", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "p1", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { q: "a" }, expected_output: "A" },
            };
            yield {
              formatted: Promise.resolve({ query: { prompt: "p2", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: { q: "b" }, expected_output: "B" },
            };
          })()
        )
      );

      mockQueryResults.push(
        { type: "result", subtype: "success", result: "R1" },
        { type: "result", subtype: "success", result: "R2" }
      );

      const result = await handler.runExperiment(createMockAst(), "my-experiment");

      const chunks = await drainStream(result.stream);
      const parsed = chunks.map((c) => JSON.parse(c));

      const startEvent = parsed.find((p) => p.type === "experiment_start");
      const datasetEvents = parsed.filter((p) => p.type === "dataset");

      // All events should have the same runId (UUID)
      const runId = startEvent.runId;
      expect(runId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      for (const event of datasetEvents) {
        expect(event.runId).toBe(runId);
      }

      // runName should be the user-provided name, not the UUID
      expect(startEvent.runName).toBe("my-experiment");
      for (const event of datasetEvents) {
        expect(event.runName).toBe("my-experiment");
      }
    });

    it("should generate different runId for each experiment execution", async () => {
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: "" },
            };
          })()
        )
      );

      mockQueryResults.push(
        { type: "result", subtype: "success", result: "R1" },
        { type: "result", subtype: "success", result: "R2" }
      );

      // Run experiment twice
      const result1 = await handler.runExperiment(createMockAst(), "same-name");
      const chunks1 = await drainStream(result1.stream);
      const parsed1 = chunks1.map((c) => JSON.parse(c));
      const runId1 = parsed1.find((p) => p.type === "experiment_start")?.runId;

      // Reset mock for second run
      mockClient._mockTextPrompt.formatWithDataset.mockReturnValue(
        createMockReadableStream(
          (async function* () {
            yield {
              formatted: Promise.resolve({ query: { prompt: "test", options: {} }, telemetry: { isEnabled: true, promptName: "test" } }),
              dataset: { input: {}, expected_output: "" },
            };
          })()
        )
      );

      const result2 = await handler.runExperiment(createMockAst(), "same-name");
      const chunks2 = await drainStream(result2.stream);
      const parsed2 = chunks2.map((c) => JSON.parse(c));
      const runId2 = parsed2.find((p) => p.type === "experiment_start")?.runId;

      // Both should be valid UUIDs
      expect(runId1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(runId2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

      // But they should be different from each other
      expect(runId1).not.toBe(runId2);
    });
  });
});
