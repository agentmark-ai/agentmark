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

export type Output = ExecuteResult | Error;
type OutputDataWithStringValue = {
  kind: "file_uri" | "base64";
  value: string;
};

export type FunctionData = {
  arguments: string;
  name: string;
};

export type ToolCallData = {
  id?: string;

  type: "function";
  function: FunctionData;
  [k: string]: any;
};

export type OutputDataWithToolCallsValue = {
  kind: "tool_calls";
  value: ToolCallData[];
};

export type OutputDataWithValue =
  | OutputDataWithStringValue
  | OutputDataWithToolCallsValue;

export type ExecuteResult = {
  output_type: "execute_result";
  execution_count?: number;
  data: OutputDataWithValue | string | JSONValue;
  mime_type?: string;
  metadata?: {
    [k: string]: any;
  };
};


interface ExtractTextProps {
  children: any;
}

export interface Components extends BaseMDXProvidedComponents {
  User: FC<ExtractTextProps>;
  Assistant: FC<ExtractTextProps>;
  System: FC<ExtractTextProps>;
}

