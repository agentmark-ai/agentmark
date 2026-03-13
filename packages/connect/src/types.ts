// ── Protocol: Worker -> Platform ────────────────────────────────────────────

export interface HeartbeatMessage {
  type: 'heartbeat';
  timestamp: string;
}

export interface JobResultMessage {
  type: 'job-result';
  jobId: string;
  result: {
    type: string;
    result: string;
    traceId: string;
    usage?: Record<string, number>;
  };
}

export interface JobStreamChunkMessage {
  type: 'job-stream-chunk';
  jobId: string;
  chunk: string;
}

export interface JobStreamEndMessage {
  type: 'job-stream-end';
  jobId: string;
  traceId: string;
}

export interface JobErrorMessage {
  type: 'job-error';
  jobId: string;
  error: string;
  details?: string;
}

// ── Protocol: Platform -> Worker ────────────────────────────────────────────

export interface HeartbeatAckMessage {
  type: 'heartbeat-ack';
  timestamp: string;
}

export interface JobMessage {
  type: 'job';
  jobId: string;
  request: {
    type: 'prompt-run' | 'dataset-run';
    data: {
      ast: unknown;
      customProps?: Record<string, unknown>;
      options?: {
        shouldStream?: boolean;
      };
    };
  };
}

export interface JobCancelMessage {
  type: 'job-cancel';
  jobId: string;
  reason: string;
}

// ── Union types ─────────────────────────────────────────────────────────────

export type WorkerMessage =
  | HeartbeatMessage
  | JobResultMessage
  | JobStreamChunkMessage
  | JobStreamEndMessage
  | JobErrorMessage;

export type PlatformMessage =
  | HeartbeatAckMessage
  | JobMessage
  | JobCancelMessage;

// ── Connection ──────────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export interface WebSocketClientOptions {
  url: string;
  apiKey: string;
  appId: string;
  sdkVersion?: string;
  adapterType?: string;
  language?: string;
  heartbeatIntervalMs?: number;
  reconnectMaxDelayMs?: number;
}

export interface WebSocketClientEvents {
  onConnected: () => void;
  onDisconnected: (reason?: string) => void;
  onJob: (message: JobMessage | JobCancelMessage) => void;
  onError: (error: Error) => void;
}

// ── Connect Server API ──────────────────────────────────────────────────────

export interface JobRequest {
  type: 'prompt-run' | 'dataset-run';
  data: {
    ast: unknown;
    customProps?: Record<string, unknown>;
    options?: {
      shouldStream?: boolean;
    };
  };
}

export interface JobResult {
  type: string;
  result: string;
  traceId: string;
  usage?: Record<string, number>;
}

export interface JobStreamResult {
  stream: ReadableStream<Uint8Array>;
  traceId?: string;
}

export type JobHandlerFn = (request: JobRequest) => Promise<JobResult | JobStreamResult>;

export interface ConnectServerOptions {
  apiKey: string;
  appId: string;
  url?: string;
  handler: JobHandlerFn;
  onConnected?: () => void;
  onDisconnected?: (reason?: string) => void;
  onError?: (error: Error) => void;
  heartbeatIntervalMs?: number;
  reconnectMaxDelayMs?: number;
  language?: string;
}

export interface ConnectServer {
  start(): void;
  stop(): void;
  getStatus(): ConnectionStatus;
}
