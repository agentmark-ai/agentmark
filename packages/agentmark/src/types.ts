import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig as UntypedObjectConfig,
  ImageConfig,
  ChatMessage
} from './schemas';
import type { Schema } from 'ai';

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
  ChatMessage
};

export interface TemplateEngine {
  compile(
    template: unknown,
    props?: JSONObject,
  ): Promise<unknown>;
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

export type ObjectConfig<T = any> = UntypedObjectConfig & {
  object_config: {
    typedSchema: T;
  };
};

export interface Loader<T extends { [K in keyof T]: { input: any; output: any } } = any> {
  load(path: string, options?: any): Promise<unknown>;
}

export interface Adapter<T extends { [K in keyof T]: { input: any; output: any } }> {
  adaptObject<K extends keyof T & string>(
    input: ObjectConfig<Schema<T[K]["output"]>>,
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