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

export interface Loader<T = unknown> {
  load(path: string): Promise<T>;
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

// Define the base result types without generics
export interface AdapterTextResult<T = string> {}
export interface AdapterObjectResult<T = unknown> {
  schema?: Schema<T>;
}
export interface AdapterImageResult<T = string> {}

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

export interface PromptType {
  input: unknown;
  output: unknown;
}

export interface PromptMappingTemplate {
  [key: string]: {
    type: "text" | "object" | "image";
    props: any;
    output: any;
  };
}

export type PromptKey<T extends PromptMappingTemplate> = keyof T;

export type PromptEvaluationFn<
  T extends PromptMappingTemplate,
  A extends Adapter
> = <K extends PromptKey<T>>(
  key: K,
  props: T[K]["props"],
  adapter: A
) => any;

// Core adapter methods - simplified without circular references
export interface Adapter {
  adaptText<T>(
    input: TextConfig, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): any;
  
  adaptObject<T>(
    input: ObjectConfig & { typedSchema: Schema<T> }, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): any;
  
  adaptImage<T>(
    input: ImageConfig, 
    options: AdaptOptions, 
    metadata: PromptMetadata
  ): any;
  
  getAdapters?(): Adapter[];
}

// Now define the adapter output types
export type AdapterTextOutput<A extends Adapter, T> = ReturnType<A['adaptText']> & AdapterTextResult<T>;
export type AdapterObjectOutput<A extends Adapter, T> = ReturnType<A['adaptObject']> & AdapterObjectResult<T>;
export type AdapterImageOutput<A extends Adapter, T> = ReturnType<A['adaptImage']> & AdapterImageResult<T>;