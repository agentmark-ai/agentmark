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
    model_name?: string;
    attributes?: string;
    status_message?: string;
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
}
