export type WebhookTextResponse = {
  type: "text";
  result: string;
  usage?: unknown;
  toolCalls?: any[];
  toolResults?: any[];
  finishReason?: string;
};

export type WebhookObjectResponse = {
  type: "object";
  result: unknown;
  usage?: unknown;
  finishReason?: string;
};

export type WebhookImageResponse = {
  type: "image";
  result: Array<{ mimeType: string; base64: string }>;
};

export type WebhookSpeechResponse = {
  type: "speech";
  result: { mimeType: string; base64: string; format: string };
};

export type WebhookDatasetChunk = {
  type: "dataset";
  result: {
    input: any;
    expectedOutput?: any;
    actualOutput: any;
    tokens?: number;
    evals: Array<{ name: string; score?: number; label?: string; reason?: string }>;
  };
  runId: string;
  runName: string;
};

export type WebhookDatasetResponse = {
  stream: ReadableStream<string | Uint8Array>;
  streamHeaders: { "AgentMark-Streaming": "true" };
};

export type WebhookStreamResponse = {
  type: "stream";
  stream: ReadableStream<string | Uint8Array>;
  streamHeader: { "AgentMark-Streaming": "true" };
};

export type WebhookPromptResponse =
  | WebhookTextResponse
  | WebhookObjectResponse
  | WebhookImageResponse
  | WebhookSpeechResponse
  | WebhookStreamResponse;
