export interface LLMText {
  type: "text";
  text: string;
}

export interface LLMPrompt {
  role: "system" | "user" | "assistant" | "tool" | "input" | "output" | "tool-input" | "tool-output";
  content: LLMText[] | string;
}

export interface ScoreData {
  score: number;
  label: string;
  reason: string;
  name: string;
  id: string;
  source?: "eval" | "annotation";
  created_at?: string;
}

export interface SpanData {
  id: string;
  name: string;
  duration: number;
  parentId?: string;
  timestamp: number;
  traceId?: string;
  data: {
    type?: string;
    model?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cost?: number;
    input?: string;
    output?: string;
    outputObject?: string;
    toolCalls?: string;
    finishReason?: string;
    settings?: string;
    sessionId?: string;
    sessionName?: string;
    userId?: string;
    traceName?: string;
    promptName?: string;
    props?: string;
    attributes?: string;
    statusMessage?: string;
    status?: string;
    spanKind?: string;
    serviceName?: string;
    tenantId?: string;
    appId?: string;
    duration?: number;
    [key: string]: any;
  };
}

export interface TraceData {
  id: string;
  name: string;
  spans: SpanData[];
  data: {
    [key: string]: any;
  };
}

export interface Session {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

/**
 * Trace list item — matches the canonical `/v1/traces` wire shape
 * served by both the cloud gateway and the OSS local dev server.
 * Source of truth: the upstream monorepo's api-contract
 * TraceResponseSchema (packages/api-contract/src/schemas/traces.ts).
 * The OSS local server's wire-mapper (cli-src/server/wire-mappers.ts)
 * is pinned against the same schema, and the cloud gateway emits it
 * directly from apps/gateway/src/openapi/routes/traces.ts.
 */
export interface Trace {
  id: string;
  name: string;
  status: "UNSET" | "OK" | "ERROR";
  start: string;
  end: string;
  latency_ms: number;
  cost: number;
  tokens: number;
  span_count: number;
  tags?: string[];
}
