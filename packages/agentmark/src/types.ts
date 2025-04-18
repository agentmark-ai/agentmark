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
  ImageConfig,
  ObjectConfig,
  ChatMessage
};

export type PromptShape<T> = { [K in keyof T]: { input: any; output: any } };

export interface TemplateEngine {
  compile<R = unknown, P extends Record<string, unknown> = JSONObject>(
    template: unknown,
    props?: P,
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
  }
  apiKey?: string;
  baseURL?: string;
}

export type AdaptOptions = BaseAdaptOptions & { [key: string]: any };

export interface Loader<T extends PromptShape<T>> {
  load(path: string, options?: any): Promise<unknown>;
}

export interface Adapter<T extends PromptShape<T>> {
  adaptObject(
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
}

export type UnifiedPuzzleType<L, A> =
  L extends Loader<infer T1>
    ? A extends Adapter<infer T2>
      ? T1 extends T2
        ? (T2 extends T1 ? T1 : never)
        : never 
      : never
    : never;