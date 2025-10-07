import { LanguageModelUsage, ToolCall, ToolResult } from "ai";

export type PromptRunEventData = {
  prompt: any;
};

export type DatasetItem = {
  input: any;
  output: any;
};

export type Dataset = DatasetItem[];

export type DatasetRunEventData = {
  datasetRunName: string;
  prompt: any;
};

export type AlertEventData = {
  alert: any;
};

export type WebhookEvent =
  | {
      type: "prompt-run";
      data: PromptRunEventData;
    }
  | {
      type: "dataset-run";
      data: DatasetRunEventData;
    }
  | {
      type: "alert";
      data: AlertEventData;
    };

export type TextResponse = {
  type: "text";
  result: string;
  toolCalls: ToolCall<string, any>[];
  toolResults: ToolResult<string, any, any>[];
  finishReason: string;
  usage: LanguageModelUsage;
};

export type ObjectResponse = {
  type: "object";
  result: unknown;
  finishReason: string;
  usage: LanguageModelUsage;
};

export type ImageResponse = {
  type: "image";
  result: {
    mimeType: string;
    base64: string;
  }[];
};

export type SpeechResponse = {
  type: "speech";
  result: {
    mimeType: string;
    base64: string;
    format: string;
  };
};

export type StreamResponse = {
  type: "stream";
  stream: ReadableStream<any>;
  streamHeaders: { "AgentMark-Streaming": "true" };
};

export type WebhookResponse =
  | TextResponse
  | ObjectResponse
  | ImageResponse
  | SpeechResponse
  | StreamResponse;

export interface InferenceAdapter {
  runTextPrompt(
    input: any,
    options?: RunPromptOptions
  ): Promise<TextResponse | StreamResponse>;
  runObjectPrompt(
    input: any,
    options?: RunPromptOptions
  ): Promise<ObjectResponse | StreamResponse>;
  runImagePrompt(input: any): Promise<ImageResponse>;
  runSpeechPrompt(input: any): Promise<SpeechResponse>;
}

export type RunPromptOptions = {
  shouldStream?: boolean;
};

export type RunDatasetResponse = {
  stream: ReadableStream<any>;
  streamHeaders: { "AgentMark-Streaming": "true" };
};

export type ToolResultChunk = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  args: any;
  result: any;
};
