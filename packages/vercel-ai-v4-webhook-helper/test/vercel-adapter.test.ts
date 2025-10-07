import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { VercelAdapter } from "../src/vercel-adapter";
import { RunPromptOptions } from "../src/types";

// Mock the ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  experimental_generateImage: vi.fn(),
  experimental_generateSpeech: vi.fn(),
  streamText: vi.fn(),
  streamObject: vi.fn(),
}));

import {
  generateText,
  generateObject,
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
  streamText,
  streamObject,
} from "ai";

describe("VercelAdapter", () => {
  let adapter: VercelAdapter;
  
  beforeEach(() => {
    adapter = VercelAdapter.create();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("create", () => {
    it("should create a new VercelAdapter instance", () => {
      const result = VercelAdapter.create();
      expect(result).toBeInstanceOf(VercelAdapter);
    });
  });

  describe("runTextPrompt", () => {
    it("should call generateText when shouldStream is false", async () => {
      const mockResult = {
        text: "Hello, world!",
        finishReason: "stop",
        usage: { totalTokens: 10 },
        steps: [
          {
            toolCalls: [{ id: "1", name: "tool1", args: {} }],
            toolResults: [{ id: "1", result: "result1" }],
          },
        ],
      };

      vi.mocked(generateText).mockResolvedValue(mockResult);

      const input = { messages: [{ role: "user", content: "Hello" }] };
      const options: RunPromptOptions = { shouldStream: false };

      const result = await adapter.runTextPrompt(input, options);

      expect(generateText).toHaveBeenCalledWith(input);
      expect(result).toEqual({
        type: "text",
        result: "Hello, world!",
        toolCalls: [{ id: "1", name: "tool1", args: {} }],
        toolResults: [{ id: "1", result: "result1" }],
        finishReason: "stop",
        usage: { totalTokens: 10 },
      });
    });

    it("should call streamText when shouldStream is true", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", textDelta: "Hello" };
          yield { type: "text-delta", textDelta: " world" };
          yield { type: "finish", finishReason: "stop", usage: { totalTokens: 5 } };
        },
      };

      vi.mocked(streamText).mockReturnValue({
        fullStream: mockStream,
      } as any);

      const input = { messages: [{ role: "user", content: "Hello" }] };
      const options: RunPromptOptions = { shouldStream: true };

      const result = await adapter.runTextPrompt(input, options);

      expect(streamText).toHaveBeenCalledWith(input);
      expect(result.type).toBe("stream");
      if (result.type === "stream") {
        expect(result.stream).toBeInstanceOf(ReadableStream);
        expect(result.streamHeaders).toEqual({ "AgentMark-Streaming": "true" });
      }
    });

    it("should default to streaming when shouldStream is undefined", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "text-delta", textDelta: "Hello" };
        },
      };

      vi.mocked(streamText).mockReturnValue({
        fullStream: mockStream,
      } as any);

      const input = { messages: [{ role: "user", content: "Hello" }] };

      const result = await adapter.runTextPrompt(input);

      expect(streamText).toHaveBeenCalledWith(input);
      expect(result.type).toBe("stream");
    });

    it("should handle tool calls in streaming", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "tool-call",
            toolCallId: "call_123",
            toolName: "testTool",
            args: { param: "value" },
          };
        },
      };

      vi.mocked(streamText).mockReturnValue({
        fullStream: mockStream,
      } as any);

      const input = { messages: [{ role: "user", content: "Hello" }] };
      const result = await adapter.runTextPrompt(input);

      expect(result.type).toBe("stream");
      if (result.type === "stream") {
        expect(result.stream).toBeInstanceOf(ReadableStream);
      }
    });

    it("should handle errors in streaming", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "error",
            error: {
              data: {
                error: {
                  message: "Test error message",
                },
              },
            },
          };
        },
      };

      vi.mocked(streamText).mockReturnValue({
        fullStream: mockStream,
      } as any);

      const input = { messages: [{ role: "user", content: "Hello" }] };
      const result = await adapter.runTextPrompt(input);

      expect(result.type).toBe("stream");
      if (result.type === "stream") {
        expect(result.stream).toBeInstanceOf(ReadableStream);
      }
    });
  });

  describe("runObjectPrompt", () => {
    it("should call generateObject when shouldStream is false", async () => {
      const mockResult = {
        object: { answer: 42 },
        finishReason: "stop",
        usage: { totalTokens: 15 },
      };

      vi.mocked(generateObject).mockResolvedValue(mockResult);

      const input = { 
        messages: [{ role: "user", content: "What is 2+2?" }],
        schema: { type: "object" }
      };
      const options: RunPromptOptions = { shouldStream: false };

      const result = await adapter.runObjectPrompt(input, options);

      expect(generateObject).toHaveBeenCalledWith(input);
      expect(result).toEqual({
        type: "object",
        result: { answer: 42 },
        finishReason: "stop",
        usage: { totalTokens: 15 },
      });
    });

    it("should call streamObject when shouldStream is true", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { type: "object", object: { partial: "data" } };
        },
      };

      const mockUsage = Promise.resolve({ totalTokens: 10 });

      vi.mocked(streamObject).mockReturnValue({
        fullStream: mockStream,
        usage: mockUsage,
      } as any);

      const input = { 
        messages: [{ role: "user", content: "What is 2+2?" }],
        schema: { type: "object" }
      };
      const options: RunPromptOptions = { shouldStream: true };

      const result = await adapter.runObjectPrompt(input, options);

      expect(streamObject).toHaveBeenCalledWith(input);
      expect(result.type).toBe("stream");
      if (result.type === "stream") {
        expect(result.stream).toBeInstanceOf(ReadableStream);
        expect(result.streamHeaders).toEqual({ "AgentMark-Streaming": "true" });
      }
    });

    it("should handle errors in object streaming", async () => {
      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield {
            type: "error",
            error: {
              data: {
                error: {
                  message: "Object generation error",
                },
              },
            },
          };
        },
      };

      const mockUsage = Promise.resolve({ totalTokens: 0 });

      vi.mocked(streamObject).mockReturnValue({
        fullStream: mockStream,
        usage: mockUsage,
      } as any);

      const input = { 
        messages: [{ role: "user", content: "What is 2+2?" }],
        schema: { type: "object" }
      };

      const result = await adapter.runObjectPrompt(input);

      expect(result.type).toBe("stream");
      if (result.type === "stream") {
        expect(result.stream).toBeInstanceOf(ReadableStream);
      }
    });
  });

  describe("runImagePrompt", () => {
    it("should call generateImage and return formatted response", async () => {
      const mockImages = [
        { mimeType: "image/png", base64: "base64data1" },
        { mimeType: "image/jpeg", base64: "base64data2" },
      ];

      vi.mocked(generateImage).mockResolvedValue({
        images: mockImages,
      } as any);

      const input = { 
        prompt: "Generate an image of a cat",
        model: "dall-e-3"
      };

      const result = await adapter.runImagePrompt(input);

      expect(generateImage).toHaveBeenCalledWith(input);
      expect(result).toEqual({
        type: "image",
        result: [
          { mimeType: "image/png", base64: "base64data1" },
          { mimeType: "image/jpeg", base64: "base64data2" },
        ],
      });
    });

    it("should handle empty images array", async () => {
      vi.mocked(generateImage).mockResolvedValue({
        images: [],
      } as any);

      const input = { 
        prompt: "Generate an image",
        model: "dall-e-3"
      };

      const result = await adapter.runImagePrompt(input);

      expect(result).toEqual({
        type: "image",
        result: [],
      });
    });
  });

  describe("runSpeechPrompt", () => {
    it("should call generateSpeech and return formatted response", async () => {
      const mockAudio = {
        mimeType: "audio/mpeg",
        base64: "audiobase64data",
        format: "mp3",
      };

      vi.mocked(generateSpeech).mockResolvedValue({
        audio: mockAudio,
      } as any);

      const input = { 
        text: "Hello, this is a test speech",
        voice: "nova"
      };

      const result = await adapter.runSpeechPrompt(input);

      expect(generateSpeech).toHaveBeenCalledWith(input);
      expect(result).toEqual({
        type: "speech",
        result: {
          mimeType: "audio/mpeg",
          base64: "audiobase64data",
          format: "mp3",
        },
      });
    });
  });
});