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

export interface PromptMetadata {
  props: JSONObject;
  path: string | undefined;
  template: any;
}

export interface Adapter {
  adaptText(input: TextConfig, options: JSONObject, settings: PromptMetadata): any;
  adaptObject<T = any>(input: ObjectConfig, options: JSONObject, settings: PromptMetadata): any;
  adaptImage(input: ImageConfig, options: JSONObject, settings: PromptMetadata): any;
}

export type BaseAdaptOptions = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, any>;
  }
  apiKey?: string;
}

export interface PromptType {
  input: any;
  output: any;
}