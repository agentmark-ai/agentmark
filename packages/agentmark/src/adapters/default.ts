import { 
  Adapter, 
  TextConfig, 
  ObjectConfig, 
  ImageConfig, 
  JSONObject, 
  PromptMetadata,
  AdapterTextResult,
  AdapterObjectResult,
  AdapterImageResult
} from "../types";
import type { Schema } from 'ai';

// Define specific return types for DefaultAdapter
export type DefaultTextResult<T = string> = TextConfig & AdapterTextResult<T>;
export type DefaultObjectResult<T = unknown> = ObjectConfig & AdapterObjectResult<T>;
export type DefaultImageResult<T = string> = ImageConfig & AdapterImageResult<T>;

export class DefaultAdapter implements Adapter<DefaultTextResult<any>, DefaultObjectResult<any>, DefaultImageResult<any>> {
  adaptText<T = string>(
    input: TextConfig, 
    options?: JSONObject,
    settings?: PromptMetadata
  ): DefaultTextResult<T> {
    return {
      ...input
    };
  }

  adaptObject<T = unknown>(
    input: ObjectConfig & { jsonSchema?: Schema<T> },
    options?: JSONObject,
    settings?: PromptMetadata
  ): DefaultObjectResult<T> {
    return { 
      ...input, 
      schema: input.jsonSchema 
    };
  }

  adaptImage<T = string>(
    input: ImageConfig,
    options?: JSONObject,
    settings?: PromptMetadata
  ): DefaultImageResult<T> {
    return {
      ...input
    };
  }
}