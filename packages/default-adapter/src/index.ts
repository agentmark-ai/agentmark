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
  K extends KeysWithKind<T, "object"> & string
> extends ObjectPrompt<T, A, K> {
  format({
    props,
  }: PromptFormatParams<T[K]["input"]>): Promise<ReturnType<A["adaptObject"]>>;
}

export interface DefaultAgentmark<T extends PromptShape<T>>
  extends AgentMark<T, DefaultAdapter<T>> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<DefaultObjectPrompt<T, DefaultAdapter<T>, K>>;
}

export function createAgentMarkClient<D extends PromptShape<D>>(opts: {
  loader?: Loader<D>;
}): DefaultAgentmark<D> {
  const adapter = new DefaultAdapter<D>();

  return new AgentMark<D, DefaultAdapter<D>>({
    loader: opts.loader,
    adapter,
  });
}

export { DefaultAdapter } from "./adapter";
