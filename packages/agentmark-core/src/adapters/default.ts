import { 
  Adapter, 
  TextConfig,
  ImageConfig,
  ObjectConfig, 
  PromptShape
} from "../types";

export class DefaultAdapter<
  T extends PromptShape<T> = any
> implements Adapter<T> {
  declare readonly __dict: T;
  

  adaptText(
    input: TextConfig,
  ): TextConfig {
    return input;
  }

  adaptObject(
    input: ObjectConfig,
  ): ObjectConfig {
    return input;
  }

  adaptImage(
    input: ImageConfig,
  ): ImageConfig {
    return input;
  }

  adaptSpeech(
    input: any,
  ): any {
    return input;
  }
}