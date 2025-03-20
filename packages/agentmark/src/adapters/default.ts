import { 
  Adapter, 
  TextConfig, 
  ObjectConfig, 
  ImageConfig, 
  AdapterTextResult,
  AdapterObjectResult,
  AdapterImageResult
} from "../types";
import type { Schema } from 'ai';

export type DefaultTextResult<T = string> = TextConfig & AdapterTextResult<T>;
export type DefaultObjectResult<T = unknown> = ObjectConfig & AdapterObjectResult<T> & { schema?: Schema<T> };
export type DefaultImageResult<T = string> = ImageConfig & AdapterImageResult<T>;

export class DefaultAdapter implements Adapter<DefaultTextResult<any>, DefaultObjectResult<any>, DefaultImageResult<any>> {
  adaptText<T = string>(
    input: TextConfig, 
  ): DefaultTextResult<T> {
    return input;
  }

  adaptObject<T = unknown>(
    input: ObjectConfig & { typedSchema: Schema<T> },
  ): DefaultObjectResult<T> {
    return input;
  }

  adaptImage<T = string>(
    input: ImageConfig,
  ): DefaultImageResult<T> {
    return input;
  }
}