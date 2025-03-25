import { 
  Adapter, 
  TextConfig, 
  ObjectConfig, 
  ImageConfig, 
} from "../types";
import type { Schema } from 'ai';

export class DefaultAdapter<
  T extends { [K in keyof T]: { input: any; output: any } },
> implements Adapter<T> {
  adaptText(
    input: TextConfig,
  ): TextConfig {
    return input;
  }

  adaptObject<K extends keyof T & string, O = T[K]['output']>(
    input: ObjectConfig & { typedSchema: Schema<T[K]["output"]> },
  ): ObjectConfig & { typedSchema: Schema<O> }{
    return input;
  }

  adaptImage(
    input: ImageConfig,
  ): ImageConfig {
    return input;
  }
}