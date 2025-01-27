import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { FC } from 'react';
import { LanguageModel, GenerateTextResult } from 'ai';
import type { Ast } from "@puzzlet/templatedx";
import {
  ChatMessageSchema,
  AgentMarkTextSettingsSchema,
  AgentMarkSchemaSettingsSchema,
  AgentMarkSchema
} from './schemas';
import { z } from "zod";

type JSONPrimitive = string | number | boolean | null | undefined;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONArray = JSONValue[];

interface ExtractTextProps {
  children: any;
}

type TelemetrySettings = {
  isEnabled?: boolean;
  functionId?: string;
  metadata?: Record<string, any>;
};
export type InferenceOptions = {
  telemetry?: TelemetrySettings;
  apiKey?: string;
};

export type AgentMarkTextSettings = z.infer<typeof AgentMarkTextSettingsSchema>;
export type AgentMarkSchemaSettings = z.infer<typeof AgentMarkSchemaSettingsSchema>;
export type AgentMarkSettings = AgentMarkTextSettings | AgentMarkSchemaSettings;

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export type JSONObject = { [member: string]: JSONValue | any };

export interface AISDKBaseSettings {
  model: LanguageModel;
  messages?: Array<ChatMessage>;
  maxTokens?: number;
  maxSteps?: number;
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
  experimental_telemetry?: TelemetrySettings;
}

export type AgentMark = z.infer<typeof AgentMarkSchema>;

export interface TypsafeTemplate<Input, Output> {
  content: Ast;
  run: (props: Input, options?: InferenceOptions) => Promise<AgentMarkOutput<Output>>;
  compile: (props?: Input) => Promise<AgentMark>;
  deserialize: (response: Input) => Promise<any>;
}

export interface AgentMarkLoader<Types extends Record<string, { input: any; output: any }>> {
  load<Path extends keyof Types>(
    templatePath: Path
  ): Promise<TypsafeTemplate<Types[Path]["input"], Types[Path]["output"]>>;
}

export interface AgentMarkOutputV1 {
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

export interface AgentMarkOutput<T = any> {
  result: T;
  version: string;
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

export interface Components extends BaseMDXProvidedComponents {
  User: FC<ExtractTextProps>;
  Assistant: FC<ExtractTextProps>;
  System: FC<ExtractTextProps>;
}

