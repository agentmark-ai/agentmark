import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  ChatMessage
} from './schemas';

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

export type {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  ChatMessage
};

export interface Loader<T = any> {
  load(path: string): Promise<T>;
}

export interface TemplateEngine {
  format(
    template: any,
    props?: JSONObject,
  ): any;
}

export interface Adapter<TextOutput = any, ObjectOutput = any, ImageOutput = any> {
  adaptText(input: TextConfig, runtimeConfig?: RuntimeConfig): TextOutput;
  adaptObject(input: ObjectConfig, runtimeConfig?: RuntimeConfig): ObjectOutput;
  adaptImage(input: ImageConfig, runtimeConfig?: RuntimeConfig): ImageOutput;
}

export type RuntimeConfig = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
  }
  apiKey?: string;
  [key: string]: any;
}

export interface PromptType {
  input: any;
  output: any;
}