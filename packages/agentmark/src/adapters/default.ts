import { 
  Adapter, 
  TextConfig,
  ImageConfig,
  EnhancedObjectConfig, 
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
    input: EnhancedObjectConfig<Schema<T[K]["output"]>>,
  ): EnhancedObjectConfig<Schema<T[K]["output"]>> {
    return input;
  }

  adaptImage(
    input: ImageConfig,
  ): ImageConfig {
    return input;
  }
}