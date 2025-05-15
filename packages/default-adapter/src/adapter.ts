import { 
  Adapter, 
  TextConfig,
  ImageConfig,
  ObjectConfig, 
  PromptShape
} from "@agentmark/agentmark-core";

export class DefaultAdapter<
  T extends PromptShape<T>
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
}