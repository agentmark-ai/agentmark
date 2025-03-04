import type {
  LanguageModelUsage,
  FinishReason,
  GenerateTextResult,
} from 'ai';

export interface AgentMarkOutputV1 {
  version?: undefined;
  result: {
    text?: string;
    object?: any;
  };
  tools?: Array<{
    name: string;
    input: Record<string, any>;
    output?: Record<string, any>;
  }>;
  toolResponses?: GenerateTextResult<any, never>['toolResults'];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown";
}

export interface AgentMarkOutputV2<T = any> {
  result: T;
  version: "v2.0";
  tools?: Array<{
    name: string;
    input: Record<string, any>;
    output?: Record<string, any>;
  }>;
  toolResponses?: GenerateTextResult<any, never>['toolResults'];
  steps?: GenerateTextResult<any, never>['steps'],
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown";
}

export interface AgentMarkStreamOutput<T = any> {
  usage: Promise<LanguageModelUsage>;
  resultStream: AsyncIterable<Partial<T>>;
  version: "v2.0";
  tools?: Promise<Array<{
    name: string;
    input: Record<string, any>;
    output?: Record<string, any>;
  }>>;
  toolResponses?: Promise<GenerateTextResult<any, never>['toolResults']>;
  steps?: Promise<GenerateTextResult<any, never>['steps']>;
  finishReason: Promise<FinishReason>;
}
