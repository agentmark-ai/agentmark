export interface LLMText {
  type: "text";
  text: string;
}

export interface LLMPrompt {
  role: "system" | "user" | "assistant" | "tool";
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

export interface Trace {
  id: string;
  name: string;
  status: string;
  latency: string;
  cost: string;
  tokens: string;
  start: string;
  end: string;
  spanCount: number;
}
