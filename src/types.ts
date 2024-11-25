import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { FC } from 'react';
import { LanguageModel } from 'ai';

type JSONPrimitive = string | number | boolean | null | undefined;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONArray = JSONValue[];
export type JSONObject = { [member: string]: JSONValue | any };

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant',
  content: string,
};

export interface PromptDXModelSettings<T = unknown> {
  model: string;
  stream: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  stop_sequences?: string[];
  seed?: number;
  max_retries?: number;
  abort_signal?: AbortSignal;
  headers?: Record<string, string>;
  schema?: T;
  tools?: Record<
    string,
    {
      description: string;
      parameters: JSONObject;
    }
  >;
}

export interface AISDKBaseSettings {
  model: LanguageModel;
  messages?: Array<ChatMessage>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stopSequences?: string[];
  seed?: number;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}

export interface AISDKTextSettings extends AISDKBaseSettings {
  tools?: Record<
    string,
    {
      description: string;
      parameters: JSONObject;
      execute?: (args: any) => Promise<unknown>;
    }
  >;
}

export interface AISDKObjectSettings<T = unknown> extends AISDKBaseSettings {
  output?: 'no-schema';
  schema: T;
};


export interface PromptDX {
  name: string;
  messages: Array<ChatMessage>;
  metadata: {
    model: {
      name: string;
      settings: PromptDXModelSettings;
    };
  };
}

export type PromptDXOutput = {
  result: {
    data: string | Record<string, any>;
    type: "text" | "object";
  };
  tools: Array<{
    name: string;
    input: Record<string, any>;
    output?: Record<string, any>;
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other" | "unknown";
};


interface ExtractTextProps {
  children: any;
}

export interface Components extends BaseMDXProvidedComponents {
  User: FC<ExtractTextProps>;
  Assistant: FC<ExtractTextProps>;
  System: FC<ExtractTextProps>;
}

