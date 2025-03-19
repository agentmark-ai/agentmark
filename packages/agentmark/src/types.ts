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

// Basic JSON types
export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

// Re-export schema types
export type {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  ChatMessage
};

// Loader and TemplateEngine interfaces
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

// Base adapter result types with their type markers
export type AdapterTextResult<T = string> = { 
  __textOutput?: T 
};

export type AdapterObjectResult<T = unknown> = { 
  __objectOutput?: T 
};

export type AdapterImageResult<T = string> = { 
  __imageOutput?: T 
};

// Core adapter methods that every adapter must implement
export interface AdapterMethods<TextOut, ObjectOut, ImageOut> {
  adaptText<U>(input: TextConfig, options: JSONObject, settings: PromptMetadata): TextOut & AdapterTextResult<U>;
  adaptObject<U>(input: ObjectConfig, options: JSONObject, settings: PromptMetadata): ObjectOut & AdapterObjectResult<U>;
  adaptImage<U>(input: ImageConfig, options: JSONObject, settings: PromptMetadata): ImageOut & AdapterImageResult<U>;
}

// Main Adapter interface
export interface Adapter<
  TextOut = AdapterTextResult, 
  ObjectOut = AdapterObjectResult, 
  ImageOut = AdapterImageResult
> extends AdapterMethods<TextOut, ObjectOut, ImageOut> {}

// Utility types for adapter outputs
// -------------------------------------------

/**
 * Transforms Schema<any> to Schema<T> in an object
 * and handles adapter output type markers
 */
export type TransformSchema<T, U> = 
  T extends Schema<unknown> 
    ? Schema<U> 
    : T extends { __textOutput?: unknown }
      ? Omit<T, '__textOutput'> & { __textOutput?: U }
    : T extends { __objectOutput?: unknown }
      ? Omit<T, '__objectOutput'> & { __objectOutput?: U }
    : T extends { __imageOutput?: unknown }
      ? Omit<T, '__imageOutput'> & { __imageOutput?: U }
    : T extends object 
      ? { [K in keyof T]: TransformSchema<T[K], U> } 
      : T;

/**
 * Transformer for adapter text output
 */
export type GetAdapterTextResult<A, T> = 
  A extends { adaptText<U>(input: TextConfig, options: JSONObject, settings: PromptMetadata): infer R }
    ? R & { __textOutput?: T }
    : never;

/**
 * Transformer for adapter object output
 */
export type GetAdapterObjectResult<A, T> = 
  A extends { adaptObject<U>(input: ObjectConfig, options: JSONObject, settings: PromptMetadata): infer R } 
    ? R extends { schema?: Schema<any> }
      ? Omit<R, 'schema'> & { schema: Schema<T>; object: T }
      : R & { schema: Schema<T>; object: T }
    : never;

/**
 * Transformer for adapter image output
 */
export type GetAdapterImageResult<A, T> = 
  A extends { adaptImage<U>(input: ImageConfig, options: JSONObject, settings: PromptMetadata): infer R }
    ? R & { __imageOutput?: T }
    : never;

// Public convenience type aliases used by prompt implementations
export type AdapterTextOutput<A, T> = GetAdapterTextResult<A, T>;
export type AdapterObjectOutput<A, T> = GetAdapterObjectResult<A, T>;
export type AdapterImageOutput<A, T> = GetAdapterImageResult<A, T>;

// Base options for adapters
export type BaseAdaptOptions = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, unknown>;
  }
  apiKey?: string;
}

// Type interface for prompt definitions
export interface PromptType {
  input: unknown;
  output: unknown;
}