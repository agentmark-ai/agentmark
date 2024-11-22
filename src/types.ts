import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { FC } from 'react';

type JSONPrimitive = string | number | boolean | null | undefined;
type JSONValue = JSONPrimitive | JSONObject | JSONArray;
type JSONArray = JSONValue[];
export type JSONObject = { [member: string]: JSONValue | any };

export interface ChatMessage {
  role: string,
  content: string,
};

export interface PromptDX {
  name: string;
  messages: Array<ChatMessage>;
  metadata: {
    model: {
      name: string;
      settings: JSONObject;
    };
  };
}

export type Output = {
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

