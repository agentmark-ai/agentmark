import type { ChatCompletionMessageParam } from "openai/resources";
import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { FC } from 'react';

export type JSONPrimitive = string | number | boolean | null | undefined;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [member: string]: JSONValue | any };
export type JSONArray = JSONValue[];

export type ChatHistoryMessage = ChatCompletionMessageParam;

export type AttachmentDataWithStringValue = {
  kind: "file_uri" | "base64";
  value: string;
};

export type Attachment = {
  data: JSONValue | AttachmentDataWithStringValue;
  mime_type?: string;
  metadata?: {
    [k: string]: any;
  };
};

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

