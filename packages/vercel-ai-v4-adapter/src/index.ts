import {
  AdaptOptions,
  AgentMark,
  KeysWithKind,
  Loader,
  ObjectPrompt,
  PromptFormatParams,
  PromptShape,
} from "@agentmark/agentmark-core";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIObjectParams,
  VercelAIToolRegistry,
} from "./adapter";
import type { Root } from "mdast";

export interface VercelAIObjectPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "object"> & string,
  Tools extends VercelAIToolRegistry<any, any>
> extends ObjectPrompt<T, VercelAIAdapter<T, Tools>, K> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<VercelAIObjectParams<T[K]["output"]>>;

  formatWithDataset(
    options?: AdaptOptions
  ): Promise<ReadableStream<VercelAIObjectParams<T[K]["output"]>>>;

  formatWithTestProps(
    options: AdaptOptions
  ): Promise<VercelAIObjectParams<T[K]["output"]>>;
}

export interface VercelAgentMark<
  T extends PromptShape<T>,
  Tools extends VercelAIToolRegistry<any, any>
> extends AgentMark<T, VercelAIAdapter<T, Tools>> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<VercelAIObjectPrompt<T, K, Tools>>;
}

export function createAgentMarkClient<
  D extends PromptShape<D> = any,
  T extends VercelAIToolRegistry<any, any> = VercelAIToolRegistry<any, any>
>(opts: {
  loader?: Loader<D>;
  modelRegistry: VercelAIModelRegistry;
  toolRegistry?: T;
}): VercelAgentMark<D, T> {
  const adapter = new VercelAIAdapter<D, T>(
    opts.modelRegistry,
    opts.toolRegistry
  );

  return new AgentMark<D, VercelAIAdapter<D, T>>({
    loader: opts.loader,
    adapter,
  });
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "./adapter";
