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

export interface AdapterTextResult<T = string> {}

export interface AdapterObjectResult<T = unknown> {
  __objectOutput?: T;
  // NOTE: This is a temporary solution to allow for the schema to be passed in as a property
  // TODO: Remove this once we have a better solution
  schema?: Schema<T>;
}

export interface AdapterImageResult<T = string> {}

// Core adapter methods
export interface Adapter<
  TextOut extends AdapterTextResult<any> = AdapterTextResult<any>, 
  ObjectOut extends AdapterObjectResult<any> = AdapterObjectResult<any>, 
  ImageOut extends AdapterImageResult<any> = AdapterImageResult<any>
> {
  adaptText<T>(
    input: TextConfig, 
    options: JSONObject, 
    settings: PromptMetadata
  ): TextOut;
  
  adaptObject<T>(
    input: ObjectConfig, 
    options: JSONObject, 
    settings: PromptMetadata
  ): ObjectOut & AdapterObjectResult<T>;
  
  adaptImage<T>(
    input: ImageConfig, 
    options: JSONObject, 
    settings: PromptMetadata
  ): ImageOut;
}

export type AdapterTextOutput<A extends Adapter, T> = A extends Adapter<infer TextOut, any, any> ? TextOut : never;
export type AdapterObjectOutput<A extends Adapter, T> = A extends Adapter<any, infer ObjectOut, any> 
  ? (ObjectOut & AdapterObjectResult<T>) 
  : never;
export type AdapterImageOutput<A extends Adapter, T> = A extends Adapter<any, any, infer ImageOut> ? ImageOut : never;

export type BaseAdaptOptions = {
  telemetry?: {
    isEnabled: boolean;
    functionId?: string;
    metadata?: Record<string, unknown>;
  }
  apiKey?: string;
}

export interface PromptType {
  input: unknown;
  output: unknown;
}