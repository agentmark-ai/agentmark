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
    const { textStream, toolCalls, toolResults, finishReason, usage } =
      streamText(vercelInput);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of textStream) {
          const chunkData = encoder.encode(
            JSON.stringify({
              result: chunk,
              type: "text",
            }) + "\n"
          );
          controller.enqueue(chunkData);
        }
        const toolCallsData = await toolCalls;
        const toolResultsData = await toolResults;
        const finishReasonData = await finishReason;
        const usageData = await usage;
        const metadata = {
          usage: usageData,
          toolCalls: toolCallsData,
          toolResults: toolResultsData,
          finishReason: finishReasonData,
          type: "text",
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

  const { text, toolCalls, toolResults, finishReason, usage } =
    await generateText(vercelInput);
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
    const { usage, partialObjectStream } = streamObject(vercelInput);
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        for await (const chunk of partialObjectStream) {
          const chunkData = encoder.encode(
            JSON.stringify({
              result: chunk,
              type: "object",
            }) + "\n"
          );
          controller.enqueue(chunkData);
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
