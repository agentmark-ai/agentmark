import {
  Adapter,
  TextConfig,
  ImageConfig,
  ObjectConfig,
  PromptShape,
  AgentMark,
  AgentMarkOptions,
  KeysWithKind,
} from "@agentmark/agentmark-core";
import { DefaultObjectPrompt } from "./prompts";

export class DefaultAgentmark<T extends PromptShape<T>> extends AgentMark<
  T,
  DefaultAdapter<T>
> {
  constructor(opts: AgentMarkOptions<T, DefaultAdapter<T>>) {
    super(opts);
  }

  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K,
    options?: any
  ): Promise<DefaultObjectPrompt<T, DefaultAdapter<T>, K>> {
    return super.loadObjectPrompt(pathOrPreloaded, options);
  }
}

export class DefaultAdapter<T extends PromptShape<T>> implements Adapter<T> {
  declare readonly __dict: T;

  adaptText(input: TextConfig): TextConfig {
    return input;
  }

  adaptObject<K extends KeysWithKind<T, "object"> & string>(
    input: ObjectConfig
  ): ObjectConfig{
    return input;
  }

  adaptImage(input: ImageConfig): ImageConfig {
    return input;
  }
}
