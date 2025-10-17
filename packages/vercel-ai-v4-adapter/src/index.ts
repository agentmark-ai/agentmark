import {
  AdaptOptions,
  AgentMark,
  KeysWithKind,
  Loader,
  EvalRegistry,
  ObjectPrompt,
  PromptFormatParams,
  PromptShape,
} from "@agentmark/agentmark-core";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIObjectParams,
  VercelAIToolRegistry,
} from "./adapter.js";
import type {
  DatasetErrorChunk,
  DatasetStreamChunk,
  McpServers,
} from "@agentmark/agentmark-core";
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
  ): Promise<
    ReadableStream<
      | DatasetStreamChunk<VercelAIObjectParams<T[K]["output"]>>
      | DatasetErrorChunk
    >
  >;

  formatWithTestProps(
    options?: AdaptOptions
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

// Accept a wider loader shape for compatibility across versions
export type LoaderLike<D> = {
  load: (...args: any[]) => Promise<unknown>;
  loadDataset: (datasetPath: string) => Promise<ReadableStream<{ input: Record<string, unknown>; expected_output?: string }>>;
};

export function createAgentMarkClient<
  D extends PromptShape<D> = PromptShape<any>,
  T extends VercelAIToolRegistry<any, any> = VercelAIToolRegistry<any, any>
>(opts: {
  loader?: LoaderLike<D>;
  modelRegistry: VercelAIModelRegistry;
  toolRegistry?: T;
  evalRegistry?: EvalRegistry;
  mcpServers?: McpServers;
}): VercelAgentMark<D, T> {
  const adapter = new VercelAIAdapter<D, T>(
    opts.modelRegistry,
    opts.toolRegistry,
    opts.mcpServers
  );

  return new AgentMark<D, VercelAIAdapter<D, T>>({
    // Cast internally to the precise Loader shape used by AgentMark
    loader: opts.loader as unknown as Loader<D>,
    adapter,
    evalRegistry: opts.evalRegistry,
  });
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "./adapter.js";
