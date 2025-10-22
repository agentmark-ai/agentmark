export type RunnerTextResponse = {
  type: "text";
  result: string;
  usage?: unknown;
  toolCalls?: any[];
  toolResults?: any[];
  finishReason?: string;
};

export type RunnerObjectResponse = {
  type: "object";
  result: unknown;
  usage?: unknown;
  finishReason?: string;
};

export type RunnerImageResponse = {
  type: "image";
  result: Array<{ mimeType: string; base64: string }>;
};

export type RunnerSpeechResponse = {
  type: "speech";
  result: { mimeType: string; base64: string; format: string };
};

export type RunnerDatasetChunk = {
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

export type RunnerDatasetResponse = {
  stream: ReadableStream<string | Uint8Array>;
  streamHeaders: { "AgentMark-Streaming": "true" };
};

export type RunnerStreamResponse = {
  type: "stream";
  stream: ReadableStream<string | Uint8Array>;
  streamHeader: { "AgentMark-Streaming": "true" };
};

export type RunnerPromptResponse =
  | RunnerTextResponse
  | RunnerObjectResponse
  | RunnerImageResponse
  | RunnerSpeechResponse
  | RunnerStreamResponse;
