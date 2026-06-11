import type { Root } from "mdast";

import { AgentMark } from "../agentmark";
import { ObjectPrompt } from "../prompts";
import type { PromptFormatParams } from "../prompts";
import type { KeysWithKind, Loader, PromptShape } from "../types";
import { DefaultAdapter } from "./default";

export interface DefaultObjectPrompt<
  T extends PromptShape<T>,
  A extends DefaultAdapter<T>,
  K extends KeysWithKind<T, "object"> & string
> extends ObjectPrompt<T, A, K> {
  format({
    props,
  }: PromptFormatParams<T[K]["input"]>): Promise<Awaited<ReturnType<A["adaptObject"]>>>;
}

export interface DefaultAgentmark<T extends PromptShape<T>>
  extends AgentMark<T, DefaultAdapter<T>> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<DefaultObjectPrompt<T, DefaultAdapter<T>, K>>;
}

/**
 * @deprecated Use `createAgentMark` from `@agentmark-ai/prompt-core` instead —
 * it now defaults to the neutral `DefaultAdapter` when no `adapter` is passed
 * and accepts the same `loader`. This alias is kept so existing imports
 * (including via `@agentmark-ai/fallback-adapter`) keep working.
 */
export function createAgentMarkClient<D extends PromptShape<D>>(opts: {
  loader?: Loader<D>;
}): DefaultAgentmark<D> {
  const adapter = new DefaultAdapter<D>();

  return new AgentMark<D, DefaultAdapter<D>>({
    loader: opts.loader,
    adapter,
  });
}
