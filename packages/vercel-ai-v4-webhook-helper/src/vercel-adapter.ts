import {
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
  generateObject,
  generateText,
  streamObject,
  streamText,
} from "ai";
import {
  ImageResponse,
  InferenceAdapter,
  ObjectResponse,
  SpeechResponse,
  StreamResponse,
  TextResponse,
  RunPromptOptions,
  ToolResultChunk,
} from "./types";

export class VercelAdapter implements InferenceAdapter {
  async runTextPrompt(
    input: any,
    options?: RunPromptOptions
  ): Promise<TextResponse | StreamResponse> {
    return vercelTextPromptRun(input, options);
  }

  static create(): VercelAdapter {
    return new VercelAdapter();
  }

  async runObjectPrompt(
    input: any,
    options?: RunPromptOptions
  ): Promise<ObjectResponse | StreamResponse> {
    return vercelObjectPromptRun(input, options);
  }

  async runImagePrompt(input: any): Promise<ImageResponse> {
    return vercelImagePromptRun(input);
  }

  async runSpeechPrompt(input: any): Promise<SpeechResponse> {
    return vercelSpeechPromptRun(input);
  }
}

async function vercelTextPromptRun(
  vercelInput: any,
  options?: RunPromptOptions
): Promise<TextResponse | StreamResponse> {
  const shouldStream =
    options?.shouldStream != undefined ? options.shouldStream : true;
  if (shouldStream) {
    const { fullStream } = streamText(vercelInput);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of fullStream) {
          if (chunk.type === "error") {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  error:
                    (chunk.error as any).data.error.message ||
                    "Something went wrong during inference",
                  type: "error",
                }) + "\n"
              )
            );
            controller.close();
            return;
          }
          if (chunk.type === "text-delta") {
            const chunkData = encoder.encode(
              JSON.stringify({
                result: chunk.textDelta,
                type: "text",
              }) + "\n"
            );
            controller.enqueue(chunkData);
          }

          if (chunk.type === "tool-call") {
            const chunkData = encoder.encode(
              JSON.stringify({
                toolCall: {
                  args: chunk.args,
                  toolCallId: chunk.toolCallId,
                  toolName: chunk.toolName,
                },
                type: "text",
              }) + "\n"
            );
            controller.enqueue(chunkData);
          }

          if ((chunk as unknown as ToolResultChunk).type === "tool-result") {
            const toolResultChunk = chunk as unknown as ToolResultChunk;
            const chunkData = encoder.encode(
              JSON.stringify({
                toolResult: {
                  args: toolResultChunk.args,
                  toolCallId: toolResultChunk.toolCallId,
                  toolName: toolResultChunk.toolName,
                },
              }) + "\n"
            );
            controller.enqueue(chunkData);
          }

          if (chunk.type === "finish") {
            const chunkData = encoder.encode(
              JSON.stringify({
                finishReason: chunk.finishReason,
                usage: chunk.usage,
                type: "text",
              }) + "\n"
            );
            controller.enqueue(chunkData);
          }
        }

        controller.close();
      },
    });
    return {
      type: "stream",
      stream,
      streamHeader: { "AgentMark-Streaming": "true" },
    };
  }

  const { text, finishReason, usage, steps } = await generateText(vercelInput);

  const toolCalls = steps.map((step) => step.toolCalls).flat();
  const toolResults = steps.map((step) => step.toolResults).flat();

  return {
    type: "text",
    result: text,
    toolCalls,
    toolResults,
    finishReason,
    usage,
  };
}

async function vercelObjectPromptRun(
  vercelInput: any,
  options?: RunPromptOptions
): Promise<ObjectResponse | StreamResponse> {
  const shouldStream =
    options?.shouldStream != undefined ? options.shouldStream : true;
  if (shouldStream) {
    const { usage, fullStream } = streamObject(vercelInput);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of fullStream) {
          if (chunk.type === "error") {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  error:
                    (chunk.error as any).data.error.message ||
                    "Something went wrong during inference",
                  type: "error",
                }) + "\n"
              )
            );
            controller.close();
            return;
          }
          if (chunk.type === "object") {
            const chunkData = encoder.encode(
              JSON.stringify({
                result: chunk.object,
                type: "object",
              }) + "\n"
            );
            controller.enqueue(chunkData);
          }
        }
        const usageData = await usage;
        const metadata = {
          usage: usageData,
          type: "object",
        };
        const metadataChunk = JSON.stringify(metadata);
        const metadataChunkData = encoder.encode(metadataChunk);
        controller.enqueue(metadataChunkData);
        controller.close();
      },
    });
    return {
      type: "stream",
      stream,
      streamHeader: { "AgentMark-Streaming": "true" },
    };
  }

  const { object, finishReason, usage } = await generateObject(vercelInput);
  return {
    type: "object",
    result: object,
    finishReason,
    usage,
  };
}

async function vercelImagePromptRun(vercelInput: any): Promise<ImageResponse> {
  const { images } = await generateImage(vercelInput);
  return {
    type: "image",
    result: images.map((image) => ({
      mimeType: image.mimeType,
      base64: image.base64,
    })),
  };
}

async function vercelSpeechPromptRun(
  vercelInput: any
): Promise<SpeechResponse> {
  const { audio } = await generateSpeech(vercelInput);
  return {
    type: "speech",
    result: {
      mimeType: audio.mimeType,
      base64: audio.base64,
      format: audio.format,
    },
  };
}
