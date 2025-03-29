import { 
  Adapter, 
  TextConfig,
  ImageConfig,
  ObjectConfig, 
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

  adaptObject<K extends keyof T & string>(
    input: ObjectConfig<Schema<T[K]["output"]>>,
  ): ObjectConfig<Schema<T[K]["output"]>> {
    return input;
  }

  adaptImage(
    input: ImageConfig,
  ): ImageConfig {
    return input;
  }
}