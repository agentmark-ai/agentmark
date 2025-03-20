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

export class DefaultAdapter implements Adapter {
  adaptText<T = string, R = AdapterTextResult<T>>(
    input: TextConfig, 
    options?: JSONObject,
    settings?: PromptMetadata
  ): R {
    return input as R;
  }

  adaptObject<T = any, R = AdapterObjectResult<T> & { schema: Schema<T>; object?: T }>(
    input: ObjectConfig,
    options?: JSONObject,
    settings?: PromptMetadata,
    schema?: Schema<T>
  ): R {
    return { ...input, schema } as R;
  }

  adaptImage<T = string, R = AdapterImageResult<T>>(
    input: ImageConfig,
    options?: JSONObject,
    settings?: PromptMetadata
  ): R {
    return input as R;
  }
}