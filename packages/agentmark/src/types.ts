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

export interface Adapter<TextOutput = any, ObjectOutput = any, ImageOutput = any, Options = {}> {
  adaptText<T>(input: TextConfig, options: Options, settings: PromptMetadata): TextOutput;
  adaptObject<T>(input: ObjectConfig, options: Options, settings: PromptMetadata): ObjectOutput;
  adaptImage<T>(input: ImageConfig, options: Options, settings: PromptMetadata): ImageOutput;
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