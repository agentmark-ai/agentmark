import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebhookHelper } from "../src/webhook-helper";
import { AgentMark } from "@agentmark/agentmark-core";
import { VercelAdapter } from "../src/vercel-adapter";
import {
  PromptRunEventData,
  DatasetRunEventData,
  RunPromptOptions,
  TextResponse,
  ObjectResponse,
  ImageResponse,
  SpeechResponse,
} from "../src/types";

// Mock dependencies
vi.mock("@agentmark/templatedx", () => ({
  getFrontMatter: vi.fn(),
}));

vi.mock("../src/utils", () => ({
  getInferenceAdapter: vi.fn(),
}));

import { getFrontMatter } from "@agentmark/templatedx";
import { getInferenceAdapter } from "../src/utils";

describe("WebhookHelper", () => {
  let webhookHelper: WebhookHelper;
  let mockAgentMarkClient: any;
  let mockInferenceAdapter: any;
  let mockPrompt: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock AgentMark client
    mockAgentMarkClient = {
      getAdapter: vi.fn(),
      getLoader: vi.fn(),
      loadObjectPrompt: vi.fn(),
      loadTextPrompt: vi.fn(),
      loadImagePrompt: vi.fn(),
      loadSpeechPrompt: vi.fn(),
    };

    // Mock inference adapter
    mockInferenceAdapter = {
      runObjectPrompt: vi.fn(),
      runTextPrompt: vi.fn(),
      runImagePrompt: vi.fn(),
      runSpeechPrompt: vi.fn(),
    };

    // Mock prompt
    mockPrompt = {
      formatWithTestProps: vi.fn(),
      formatWithDataset: vi.fn(),
    };

    vi.mocked(getInferenceAdapter).mockReturnValue(mockInferenceAdapter);

    webhookHelper = new WebhookHelper(mockAgentMarkClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with agentmarkClient and inferenceAdapter", () => {
      expect(mockAgentMarkClient.getAdapter).toHaveBeenCalled();
      expect(getInferenceAdapter).toHaveBeenCalled();
      expect(webhookHelper).toBeDefined();
    });
  });

  describe("runPrompt", () => {
    const baseEvent: PromptRunEventData = {
      prompt: "test.prompt.mdx",
    };

    it("should handle object_config prompts", async () => {
      const frontmatter = { object_config: { model: "gpt-4" } };
      const formattedInput = { messages: [], schema: {} };
      const expectedResponse: ObjectResponse = {
        type: "object",
        result: { answer: 42 },
        finishReason: "stop",
        usage: { totalTokens: 10 },
      };

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.loadObjectPrompt.mockResolvedValue(mockPrompt);
      mockPrompt.formatWithTestProps.mockResolvedValue(formattedInput);
      mockInferenceAdapter.runObjectPrompt.mockResolvedValue(expectedResponse);

      const options: RunPromptOptions = { shouldStream: false };
      const result = await webhookHelper.runPrompt(baseEvent, options);

      expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
      expect(mockAgentMarkClient.loadObjectPrompt).toHaveBeenCalledWith(
        baseEvent.prompt
      );
      expect(mockPrompt.formatWithTestProps).toHaveBeenCalledWith({});
      expect(mockInferenceAdapter.runObjectPrompt).toHaveBeenCalledWith(
        formattedInput,
        options
      );
      expect(result).toEqual(expectedResponse);
    });

    it("should handle text_config prompts", async () => {
      const frontmatter = { text_config: { model: "gpt-4" } };
      const formattedInput = { messages: [] };
      const expectedResponse: TextResponse = {
        type: "text",
        result: "Hello world",
        finishReason: "stop",
        usage: { totalTokens: 5 },
        toolCalls: [],
        toolResults: [],
      };

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.loadTextPrompt.mockResolvedValue(mockPrompt);
      mockPrompt.formatWithTestProps.mockResolvedValue(formattedInput);
      mockInferenceAdapter.runTextPrompt.mockResolvedValue(expectedResponse);

      const result = await webhookHelper.runPrompt(baseEvent);

      expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
      expect(mockAgentMarkClient.loadTextPrompt).toHaveBeenCalledWith(
        baseEvent.prompt
      );
      expect(mockPrompt.formatWithTestProps).toHaveBeenCalledWith({});
      expect(mockInferenceAdapter.runTextPrompt).toHaveBeenCalledWith(
        formattedInput,
        undefined
      );
      expect(result).toEqual(expectedResponse);
    });

    it("should handle image_config prompts", async () => {
      const frontmatter = { image_config: { model: "dall-e-3" } };
      const formattedInput = { prompt: "A cat", model: "dall-e-3" };
      const expectedResponse: ImageResponse = {
        type: "image",
        result: [{ mimeType: "image/png", base64: "base64data" }],
      };

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.loadImagePrompt.mockResolvedValue(mockPrompt);
      mockPrompt.formatWithTestProps.mockResolvedValue(formattedInput);
      mockInferenceAdapter.runImagePrompt.mockResolvedValue(expectedResponse);

      const result = await webhookHelper.runPrompt(baseEvent);

      expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
      expect(mockAgentMarkClient.loadImagePrompt).toHaveBeenCalledWith(
        baseEvent.prompt
      );
      expect(mockPrompt.formatWithTestProps).toHaveBeenCalledWith({});
      expect(mockInferenceAdapter.runImagePrompt).toHaveBeenCalledWith(
        formattedInput
      );
      expect(result).toEqual(expectedResponse);
    });

    it("should handle speech_config prompts", async () => {
      const frontmatter = { speech_config: { voice: "nova" } };
      const formattedInput = { text: "Hello world", voice: "nova" };
      const expectedResponse: SpeechResponse = {
        type: "speech",
        result: {
          mimeType: "audio/mpeg",
          base64: "audiodata",
          format: "mp3",
        },
      };

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.loadSpeechPrompt.mockResolvedValue(mockPrompt);
      mockPrompt.formatWithTestProps.mockResolvedValue(formattedInput);
      mockInferenceAdapter.runSpeechPrompt.mockResolvedValue(expectedResponse);

      const result = await webhookHelper.runPrompt(baseEvent);

      expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
      expect(mockAgentMarkClient.loadSpeechPrompt).toHaveBeenCalledWith(
        baseEvent.prompt
      );
      expect(mockPrompt.formatWithTestProps).toHaveBeenCalledWith({});
      expect(mockInferenceAdapter.runSpeechPrompt).toHaveBeenCalledWith(
        formattedInput
      );
      expect(result).toEqual(expectedResponse);
    });

    it("should throw error for invalid prompt", async () => {
      const frontmatter = {}; // No valid config

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);

      await expect(webhookHelper.runPrompt(baseEvent)).rejects.toThrow(
        "Invalid prompt"
      );
    });
  });

  describe("runDataset", () => {
    const baseEvent: DatasetRunEventData = {
      datasetRunName: "test-run",
      prompt: "dataset.prompt.mdx",
    };

    beforeEach(() => {
      // Mock crypto.randomUUID
      vi.stubGlobal("crypto", {
        randomUUID: vi.fn(() => "mock-uuid"),
      });
    });

    it("should throw error when loader is not found", async () => {
      mockAgentMarkClient.getLoader.mockReturnValue(null);

      await expect(webhookHelper.runDataset(baseEvent)).rejects.toThrow(
        "Loader not found"
      );
    });

    it("should handle text_config dataset runs", async () => {
      const frontmatter = {
        text_config: { model: "gpt-4" },
        test_settings: { dataset: "test-dataset.json" },
      };

      const mockLoader = {};
      const mockDataset = [
        {
          formatted: {
            messages: [{ role: "user", content: "What is 2+2?" }],
            experimental_telemetry: { metadata: {} },
          },
          dataset: {
            input: "What is 2+2?",
            expected_output: "4",
          },
        },
      ];

      const mockResult = {
        type: "text" as const,
        result: "4",
        usage: { totalTokens: 10 },
      };

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.getLoader.mockReturnValue(mockLoader);
      mockAgentMarkClient.loadTextPrompt.mockResolvedValue(mockPrompt);

      // Mock async iterator
      mockPrompt.formatWithDataset.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          for (const item of mockDataset) {
            yield item;
          }
        },
      });

      mockInferenceAdapter.runTextPrompt.mockResolvedValue(mockResult);

      const response = await webhookHelper.runDataset(baseEvent);

      expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
      expect(mockAgentMarkClient.getLoader).toHaveBeenCalled();
      expect(mockAgentMarkClient.loadTextPrompt).toHaveBeenCalledWith(
        baseEvent.prompt
      );
      expect(mockPrompt.formatWithDataset).toHaveBeenCalledWith({
        datasetPath: frontmatter.test_settings.dataset,
        telemetry: { isEnabled: true },
      });

      expect(response.stream).toBeInstanceOf(ReadableStream);
      expect(response.streamHeaders).toEqual({ "AgentMark-Streaming": "true" });

      // Consume the stream to trigger the inference adapter calls
      const reader = response.stream.getReader();
      const chunks: any[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (!done) {
          chunks.push(result.value);
        }
      }

      // Verify that runTextPrompt was called with correct telemetry
      expect(mockInferenceAdapter.runTextPrompt).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: "user", content: "What is 2+2?" }],
          experimental_telemetry: expect.objectContaining({
            metadata: expect.objectContaining({
              dataset_run_id: "mock-uuid",
              dataset_path: "test-dataset.json",
              dataset_run_name: "test-run",
              dataset_item_name: 0,
              traceName: "ds-run-test-run-0",
              traceId: "mock-uuid",
              dataset_expected_output: "4",
            }),
          }),
        }),
        { shouldStream: false }
      );
    });

    it(
      "should handle object_config dataset runs",
      async () => {
        const frontmatter = {
          object_config: { model: "gpt-4" },
          test_settings: { dataset: "test-dataset.json" },
        };

        const mockLoader = {};
        const mockDataset = [
          {
            formatted: {
              messages: [{ role: "user", content: "What is 2+2?" }],
              experimental_telemetry: { metadata: {} },
            },
            dataset: {
              input: "What is 2+2?",
              expected_output: { answer: 4 },
            },
          },
        ];

        const mockResult = {
          type: "object" as const,
          result: { answer: 4 },
          usage: { totalTokens: 15 },
        };

        vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
        mockAgentMarkClient.getLoader.mockReturnValue(mockLoader);
        mockAgentMarkClient.loadObjectPrompt.mockResolvedValue(mockPrompt);

        // Mock async iterator
        mockPrompt.formatWithDataset.mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            for (const item of mockDataset) {
              yield item;
            }
          },
        });

        mockInferenceAdapter.runObjectPrompt.mockResolvedValue(mockResult);

        const response = await webhookHelper.runDataset(baseEvent);

        expect(getFrontMatter).toHaveBeenCalledWith(baseEvent.prompt);
        expect(mockAgentMarkClient.loadObjectPrompt).toHaveBeenCalledWith(
          baseEvent.prompt
        );
        expect(mockPrompt.formatWithDataset).toHaveBeenCalledWith({
          datasetPath: frontmatter.test_settings.dataset,
          telemetry: { isEnabled: true },
        });

        expect(response.stream).toBeInstanceOf(ReadableStream);
        expect(response.streamHeaders).toEqual({
          "AgentMark-Streaming": "true",
        });

        // Consume the stream to trigger the inference adapter calls
        const reader = response.stream.getReader();
        const chunks: any[] = [];
        let done = false;
        while (!done) {
          const result = await reader.read();
          done = result.done;
          if (!done) {
            chunks.push(result.value);
          }
        }

        // Verify that runObjectPrompt was called with correct telemetry
        expect(mockInferenceAdapter.runObjectPrompt).toHaveBeenCalledWith(
          expect.objectContaining({
            messages: [{ role: "user", content: "What is 2+2?" }],
            experimental_telemetry: expect.objectContaining({
              metadata: expect.objectContaining({
                dataset_run_id: "mock-uuid",
                dataset_path: "test-dataset.json",
                dataset_run_name: "test-run",
                dataset_item_name: 0,
                traceName: "ds-run-test-run-0",
                traceId: "mock-uuid",
                dataset_expected_output: { answer: 4 },
              }),
            }),
          }),
          { shouldStream: false }
        );
      },
      { shouldStream: false }
    );

    it("should throw error for invalid dataset prompt", async () => {
      const frontmatter = {}; // No valid config
      const mockLoader = {};

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.getLoader.mockReturnValue(mockLoader);

      await expect(webhookHelper.runDataset(baseEvent)).rejects.toThrow(
        "Invalid prompt"
      );
    });

    it("should handle multiple dataset items correctly", async () => {
      const frontmatter = {
        text_config: { model: "gpt-4" },
        test_settings: { dataset: "test-dataset.json" },
      };

      const mockLoader = {};
      const mockDataset = [
        {
          formatted: {
            messages: [{ role: "user", content: "Item 1" }],
            experimental_telemetry: { metadata: {} },
          },
          dataset: { input: "Item 1", expected_output: "Response 1" },
        },
        {
          formatted: {
            messages: [{ role: "user", content: "Item 2" }],
            experimental_telemetry: { metadata: {} },
          },
          dataset: { input: "Item 2", expected_output: "Response 2" },
        },
      ];

      vi.mocked(getFrontMatter).mockReturnValue(frontmatter);
      mockAgentMarkClient.getLoader.mockReturnValue(mockLoader);
      mockAgentMarkClient.loadTextPrompt.mockResolvedValue(mockPrompt);

      mockPrompt.formatWithDataset.mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          for (const item of mockDataset) {
            yield item;
          }
        },
      });

      mockInferenceAdapter.runTextPrompt
        .mockResolvedValueOnce({
          type: "text",
          result: "Response 1",
          usage: { totalTokens: 5 },
        })
        .mockResolvedValueOnce({
          type: "text",
          result: "Response 2",
          usage: { totalTokens: 8 },
        });

      const response = await webhookHelper.runDataset(baseEvent);

      // Consume the stream to trigger the inference adapter calls
      const reader = response.stream.getReader();
      const chunks: any[] = [];
      let done = false;
      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (!done) {
          chunks.push(result.value);
        }
      }

      expect(mockInferenceAdapter.runTextPrompt).toHaveBeenCalledTimes(2);

      // Check that dataset_item_name is incremented correctly
      expect(mockInferenceAdapter.runTextPrompt).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          experimental_telemetry: expect.objectContaining({
            metadata: expect.objectContaining({
              dataset_item_name: 0,
              traceName: "ds-run-test-run-0",
            }),
          }),
        }),
        { shouldStream: false }
      );

      expect(mockInferenceAdapter.runTextPrompt).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          experimental_telemetry: expect.objectContaining({
            metadata: expect.objectContaining({
              dataset_item_name: 1,
              traceName: "ds-run-test-run-1",
            }),
          }),
        }),
        { shouldStream: false }
      );
    });
  });
});
