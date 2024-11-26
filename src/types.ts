import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { FC } from 'react';
import { LanguageModel } from 'ai';
import { PromptDXSchema, ChatMessageSchema, PromptDXSettingsSchema } from './schemas';
import { z } from "zod";

type JSONPrimitive = string | number | boolean | null | undefined;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONArray = JSONValue[];
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export type JSONObject = { [member: string]: JSONValue | any };

export type PromptDXSettings = z.infer<typeof PromptDXSettingsSchema>;

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

export type PromptDX = z.infer<typeof PromptDXSchema>;

export type PromptDXOutput = {
  result: {
    text?: string;
    object?: Record<string, any>;
  };
  tools?: Array<{
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

