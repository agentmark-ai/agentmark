import {
  AdaptOptions,
  AgentMark,
  KeysWithKind,
  ObjectPrompt,
  PromptFormatParams,
  PromptShape,
} from "@agentmark/agentmark-core";
import {
  MastraAdapter,
  MastraModelRegistry,
  MastraObjectParams,
  MastraToolRegistry,
} from "./adapter";
import type { Root } from "mdast";

export interface MastraObjectPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "object"> & string,
  Tools extends MastraToolRegistry<any, any>
> extends ObjectPrompt<T, MastraAdapter<T, Tools>, K> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<MastraObjectParams<T[K]["output"]>>;

  formatWithDataset(
    options?: AdaptOptions
  ): Promise<ReadableStream<MastraObjectParams<T[K]["output"]>>>;

  formatWithTestProps(
    options: AdaptOptions
  ): Promise<MastraObjectParams<T[K]["output"]>>;
}

export interface MastraAgentMark<
  T extends PromptShape<T>,
  Tools extends MastraToolRegistry<any, any>
> extends AgentMark<T, MastraAdapter<T, Tools>> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<MastraObjectPrompt<T, K, Tools>>;

  loadTextPrompt<K extends KeysWithKind<T, "text"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<any>;

  loadImagePrompt<K extends KeysWithKind<T, "image"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<any>;

  loadSpeechPrompt<K extends KeysWithKind<T, "speech"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<any>;
}

export function createAgentMarkClient<
  D extends PromptShape<D> = any,
  T extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
>(opts: {
  loader?: any;
  modelRegistry: MastraModelRegistry;
  toolRegistry?: T;
}): MastraAgentMark<D, T> {
  const adapter = new MastraAdapter<D, T>(
    opts.modelRegistry,
    opts.toolRegistry
  );

  return new AgentMark<D, MastraAdapter<D, T>>({
    loader: opts.loader,
    adapter,
  });
}

export {
  MastraAdapter,
  MastraModelRegistry,
  MastraToolRegistry,
  MastraTextParams,
  MastraObjectParams,
  MastraImageParams,
  MastraSpeechParams,
  AgentCreator,
  AgentConfig,
} from "./adapter";