export type WebhookTextResponse = {
  type: "text";
  result: string;
  traceId: string;
  usage?: unknown;
  toolCalls?: any[];
  toolResults?: any[];
  finishReason?: string;
};

export type WebhookObjectResponse = {
  type: "object";
  result: unknown;
  traceId: string;
  usage?: unknown;
  finishReason?: string;
};

export type WebhookImageResponse = {
  type: "image";
  result: Array<{ mimeType: string; base64: string }>;
  traceId: string;
};

export type WebhookSpeechResponse = {
  type: "speech";
  result: { mimeType: string; base64: string; format: string };
  traceId: string;
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
  traceId: string;
};

export type WebhookPromptResponse =
  | WebhookTextResponse
  | WebhookObjectResponse
  | WebhookImageResponse
  | WebhookSpeechResponse
  | WebhookStreamResponse;

/**
 * Creates telemetry metadata for a prompt run with traceId and traceName.
 * Use this in adapters to ensure consistent telemetry across all implementations.
 *
 * Priority for traceName: baseTelemetry.metadata.traceName > promptName > 'prompt-run'
 */
export function createPromptTelemetry(promptName?: string, baseTelemetry?: { isEnabled: boolean; metadata?: Record<string, any> }) {
  const traceId = crypto.randomUUID();
  const traceName = baseTelemetry?.metadata?.traceName || promptName || 'prompt-run';

  return {
    traceId,
    telemetry: baseTelemetry ? {
      ...baseTelemetry,
      metadata: {
        ...baseTelemetry.metadata,
        traceId,
        traceName
      }
    } : { isEnabled: true, metadata: { traceId, traceName } }
  };
}
