import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  SpeechConfig,
  ChatMessage,
  RichChatMessage,
  SpeechSettings,
  TestSettings,
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
  RichChatMessage,
  SpeechSettings,
  TestSettings,
};

export type AgentmarkConfig =
  | ObjectConfig
  | ImageConfig
  | SpeechConfig
  | TextConfig;

export type PromptShape<T> = { [K in keyof T]: { input: any; output: any } };
export type PromptDict = PromptShape<any>;
export type PromptKey<T extends PromptDict> = keyof T & string;

export type PromptKind = "object" | "text" | "image" | "speech";
export type KindOf<V> = V extends { kind: infer K } ? K : PromptKind;
export type KeysWithKind<Dict, K extends PromptKind> = {
  [P in keyof Dict]: K extends KindOf<Dict[P]> ? P : never;
}[keyof Dict];

export interface TemplateEngine {
  compile<
    R = unknown,
    P extends Record<string, unknown> = JSONObject
  >(options: {
    template: unknown;
    props?: P;
  }): Promise<R>;
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
  toolContext?: Record<string, unknown>;
};

export type AdaptOptions = BaseAdaptOptions & { [key: string]: any };

export interface Loader<T extends PromptShape<T>> {
  load(path: string, promptType: PromptKind, options?: any): Promise<unknown>;
  loadDataset(datasetPath: string): Promise<
    ReadableStream<{
      input: Record<string, unknown>;
      expected_output?: string;
    }>
  >;
}

export interface Adapter<D extends PromptShape<D>> {
  readonly __dict: D;
  readonly __name: string;

  adaptText<K extends KeysWithKind<D, "text"> & string>(
    input: TextConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;

  adaptObject<K extends KeysWithKind<D, "object"> & string>(
    input: ObjectConfig,
    options: AdaptOptions,
    metadata: PromptMetadata
  ): any;

  adaptImage<K extends KeysWithKind<D, "image"> & string>(
    input: ImageConfig,
    options: AdaptOptions
  ): any;

  adaptSpeech<K extends KeysWithKind<D, "speech"> & string>(
    input: SpeechConfig,
    options: AdaptOptions
  ): any;
}
