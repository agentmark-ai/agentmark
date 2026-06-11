import type { Root } from "mdast";

import { AgentMark } from "../agentmark";
import { ObjectPrompt } from "../prompts";
import type { PromptFormatParams } from "../prompts";
import type { KeysWithKind, PromptShape } from "../types";
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
