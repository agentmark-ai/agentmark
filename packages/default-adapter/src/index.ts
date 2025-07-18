import {
  AgentMark,
  KeysWithKind,
  Loader,
  ObjectPrompt,
  PromptFormatParams,
  PromptShape,
} from "@agentmark/agentmark-core";
import { DefaultAdapter } from "./adapter";
import type { Root } from "mdast";

export interface DefaultObjectPrompt<
  T extends PromptShape<T>,
  A extends DefaultAdapter<T>,
  K extends KeysWithKind<T, "object"> & string,
  Context = any
> extends ObjectPrompt<T, A, K, Context> {
  format({
    props,
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptObject"]>>;
}

export interface DefaultAgentmark<T extends PromptShape<T>, Context = any>
  extends AgentMark<T, DefaultAdapter<T>, Context> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<DefaultObjectPrompt<T, DefaultAdapter<T>, K, Context>>;
}

class DefaultAgentMarkBuilder<D extends PromptShape<D>, Context = unknown> {
  private loader?: Loader<D, Context>;

  withLoader<C>(loader: Loader<D, C>): DefaultAgentMarkBuilder<D, C> {
    const builder = new DefaultAgentMarkBuilder<D, C>();
    builder.loader = loader;
    return builder;
  }

  build(): DefaultAgentmark<D, Context> {
    if (!this.loader) {
      throw new Error("Loader is required. Use withLoader() before build()");
    }

    const adapter = new DefaultAdapter<D>();
    return new AgentMark({
      loader: this.loader,
      adapter,
    }) as DefaultAgentmark<D, Context>;
  }
}

export function createAgentMarkBuilder<
  D extends PromptShape<D>
>(): DefaultAgentMarkBuilder<D> {
  return new DefaultAgentMarkBuilder<D>();
}

export { DefaultAdapter } from "./adapter";
