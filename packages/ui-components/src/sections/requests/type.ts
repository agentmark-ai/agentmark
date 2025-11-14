export type Request = {
  id: string;
  tenant_id: string;
  app_id: string;
  cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  model_used: string;
  status: string;
  input: string;
  output: string | null;
  ts: Date;
  user_id: string;
  prompt_name: string;
  trace_id: string;
  status_message: string;
  props: string;
};
