import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  SpeechConfig,
  ChatMessage,
} from "./schemas";

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

export type {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ImageConfig,
  ObjectConfig,
  SpeechConfig,
  ChatMessage,
};

export type PromptShape<T> = { [K in keyof T]: { input: any; output: any } };
export type PromptDict = PromptShape<any>;
export type PromptKey<T extends PromptDict> = keyof T & string;

export type PromptKind = "object" | "text" | "image" | "speech";
export type KindOf<V> = V extends { kind: infer K } ? K : PromptKind;
export type KeysWithKind<Dict, K extends PromptKind> = {
  [P in keyof Dict]: K extends KindOf<Dict[P]> ? P : never;
}[keyof Dict];

export interface TemplateEngine {
  compile<R = unknown, P extends Record<string, unknown> = JSONObject>(
    template: unknown,
    props?: P
  ): Promise<R>;
}

export interface PromptMetadata {
  props: JSONObject;
  path: string | undefined;
  template: unknown;
}

export type BaseAdaptOptions = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, unknown>;
  };
  apiKey?: string;
  baseURL?: string;
};

export type AdaptOptions = BaseAdaptOptions & { [key: string]: any };

export interface Loader<T extends PromptShape<T>> {
  load(path: string, options?: any): Promise<unknown>;
}

export interface Adapter<T extends PromptShape<T>> {
  readonly __dict: T;
  adaptObject<_T extends PromptKey<T>>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;

  adaptText(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;

  adaptImage(
    input: ImageConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;

  adaptSpeech(
    input: SpeechConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;
}
