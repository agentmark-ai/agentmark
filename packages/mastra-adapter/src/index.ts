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
  MastraAdapter,
  MastraAgentRegistry,
  MastraObjectParams,
  MastraToolRegistry,
  MastraTextParams,
  MastraImageParams,
  MastraSpeechParams,
  MastraGenerateOptions,
  MastraExecutor,
  AgentFunctionCreator,
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

  formatWithDatasetSync(
    options?: AdaptOptions
  ): ReadableStream<MastraObjectParams<T[K]["output"]>>;
}

export interface MastraTextPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "text"> & string,
  Tools extends MastraToolRegistry<any, any>
> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<MastraTextParams<any>>;

  formatWithDataset(
    options?: AdaptOptions
  ): Promise<ReadableStream<MastraTextParams<any>>>;

  formatWithDatasetSync(
    options?: AdaptOptions
  ): ReadableStream<MastraTextParams<any>>;
}

export interface MastraImagePrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "image"> & string
> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<MastraImageParams>;

  formatWithDataset(
    options?: AdaptOptions
  ): Promise<ReadableStream<MastraImageParams>>;

  formatWithDatasetSync(
    options?: AdaptOptions
  ): ReadableStream<MastraImageParams>;
}

export interface MastraSpeechPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "speech"> & string
> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<MastraSpeechParams>;

  formatWithDataset(
    options?: AdaptOptions
  ): Promise<ReadableStream<MastraSpeechParams>>;

  formatWithDatasetSync(
    options?: AdaptOptions
  ): ReadableStream<MastraSpeechParams>;
}

export interface MastraAgentMark<
  T extends PromptShape<T>,
  Tools extends MastraToolRegistry<any, any>
> extends AgentMark<T, MastraAdapter<T, Tools>> {
  object<K extends KeysWithKind<T, "object"> & string>(
    name: K
  ): MastraObjectPrompt<T, K, Tools>;

  text<K extends KeysWithKind<T, "text"> & string>(
    name: K
  ): MastraTextPrompt<T, K, Tools>;

  image<K extends KeysWithKind<T, "image"> & string>(
    name: K
  ): MastraImagePrompt<T, K>;

  speech<K extends KeysWithKind<T, "speech"> & string>(
    name: K
  ): MastraSpeechPrompt<T, K>;
}

// Factory function for creating AgentMark client with Mastra adapter
export function createAgentMarkClient<
  T extends PromptShape<T>,
  Tools extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
>(options: {
  agentRegistry: MastraAgentRegistry;
  toolRegistry?: Tools;
  loader: Loader<T>;
}): MastraAgentMark<T, Tools> {
  const adapter = new MastraAdapter<T, Tools>(options.agentRegistry, options.toolRegistry);
  
  return new AgentMark<T, MastraAdapter<T, Tools>>({
    adapter,
    loader: options.loader,
  }) as MastraAgentMark<T, Tools>;
}

// Helper function for creating executor
export function createMastraExecutor(adapter: MastraAdapter<any, any>): MastraExecutor {
  return new MastraExecutor(adapter);
}

// Export all the core components
export {
  MastraAdapter,
  MastraAgentRegistry,
  MastraToolRegistry,
  MastraExecutor,
};

export type {
  MastraTextParams,
  MastraObjectParams,
  MastraImageParams,
  MastraSpeechParams,
  MastraGenerateOptions,
  AgentFunctionCreator,
};

// Re-export AgentMark core types for convenience
export type {
  AdaptOptions,
  PromptShape,
  KeysWithKind,
  PromptFormatParams,
  Loader,
} from "@agentmark/agentmark-core";