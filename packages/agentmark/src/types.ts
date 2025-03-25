import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
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
  ObjectConfig,
  ImageConfig,
  ChatMessage
};


// Type for external type definitions like PuzzletTypes
export type AgentMarkFileTypes = { [key: string]: { input: any; output: any } };

export interface Loader<T extends { [K in keyof T]: { input: any; output: any } }> {
  load<K extends keyof T & string>(path: K, options?: any): unknown;
}

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

export type EnhancedObjectConfig<T = any> = ObjectConfig & {
  typedSchema: T;
};

export interface Adapter<T extends { [K in keyof T]: { input: any; output: any } }> {
  adaptObject<K extends keyof T & string>(
    input: EnhancedObjectConfig<Schema<T[K]["output"]>>,
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