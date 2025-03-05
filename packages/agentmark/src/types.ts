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
  compile(
    template: any,
    props?: JSONObject,
  ): any;
}

export interface Adapter<TextOutput = any, ObjectOutput = any, ImageOutput = any> {
  adaptText(input: TextConfig, runtimeConfig?: Record<string, any>): TextOutput;
  adaptObject(input: ObjectConfig, runtimeConfig?: Record<string, any>): ObjectOutput;
  adaptImage(input: ImageConfig, runtimeConfig?: Record<string, any>): ImageOutput;
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