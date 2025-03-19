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

export type AdapterTextResult<T = string> = { __textOutput?: T };

// Base adapter object result that adapters can extend
export type AdapterObjectResult<T = any> = { __objectOutput?: T;
};

export type AdapterImageResult<T = string> = { __imageOutput?: T };

// Define a generic interface for adapter methods' return types
export interface AdapterMethods<TextOut, ObjectOut, ImageOut> {
  adaptText<T>(input: TextConfig, options: JSONObject, settings: PromptMetadata): TextOut;
  adaptObject<T>(input: ObjectConfig, options: JSONObject, settings: PromptMetadata): ObjectOut;
  adaptImage<T>(input: ImageConfig, options: JSONObject, settings: PromptMetadata): ImageOut;
}

// Update Adapter interface to use these return types
export interface Adapter<
  TextOut extends AdapterTextResult<any> = AdapterTextResult, 
  ObjectOut extends AdapterObjectResult<any> = AdapterObjectResult, 
  ImageOut extends AdapterImageResult<any> = AdapterImageResult
> extends AdapterMethods<TextOut, ObjectOut, ImageOut> {}

// Helper types for adapters to implement their own specific return types
export type GetAdapterTextResult<A, Output> = 
  A extends Adapter<infer R, any, any> ? 
    R extends { __textOutput?: infer T } ? 
      (R extends AdapterTextResult<infer U> ? 
        Omit<R, '__textOutput'> & { __textOutput?: Output } : 
        R) : 
      R : 
    never;

// This helper preserves the schema type with the correct Output type
export type SchemaWithOutput<R, Output> =
  R extends { schema: Schema<any> } 
    ? { schema: Schema<Output> } 
    : {};

export type GetAdapterObjectResult<A, Output> = 
  A extends Adapter<any, infer R, any> ? 
    R extends { __objectOutput?: infer T } ?
      Omit<R, '__objectOutput'> & 
      { __objectOutput?: Output } & 
      SchemaWithOutput<R, Output> : 
    R :
  never;

export type GetAdapterImageResult<A, Output> = 
  A extends Adapter<any, any, infer R> ? 
    R extends { __imageOutput?: infer T } ?
      (R extends AdapterImageResult<infer U> ? 
        Omit<R, '__imageOutput'> & { __imageOutput?: Output } : 
        R) : 
      R : 
    never;

export type AdapterTextOutput<A, Output> = GetAdapterTextResult<A, Output>;

export type AdapterObjectOutput<A, Output> = GetAdapterObjectResult<A, Output>;

export type AdapterImageOutput<A, Output> = GetAdapterImageResult<A, Output>;

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