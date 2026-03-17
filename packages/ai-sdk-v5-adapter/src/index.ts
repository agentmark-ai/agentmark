import {
  AdaptOptions,
  AgentMark,
  KeysWithKind,
  Loader,
  EvalRegistry,
  ObjectPrompt,
  PromptFormatParams,
  PromptShape,
  FormatWithDatasetOptions,
  PromptKind,
} from "@agentmark-ai/prompt-core";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIObjectParams,
} from "./adapter";
import type {
  DatasetErrorChunk,
  DatasetStreamChunk,
} from "@agentmark-ai/prompt-core";
import type { Root } from "mdast";
import type { Tool } from "ai";
import type { McpServers } from "@agentmark-ai/prompt-core";

export interface VercelAIObjectPrompt<
  T extends PromptShape<T>,
  K extends KeysWithKind<T, "object"> & string,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends ObjectPrompt<T, VercelAIAdapter<T, TTools>, K> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<VercelAIObjectParams<T[K]["output"], TTools>>;

  formatWithDataset(
    options?: FormatWithDatasetOptions
  ): Promise<
    ReadableStream<
      | DatasetStreamChunk<VercelAIObjectParams<T[K]["output"], TTools>>
      | DatasetErrorChunk
    >
  >;

  formatWithTestProps(
    options?: AdaptOptions
  ): Promise<VercelAIObjectParams<T[K]["output"], TTools>>;
}

export interface VercelAgentMark<
  T extends PromptShape<T>,
  TTools extends Record<string, Tool> = Record<string, Tool>
> extends AgentMark<T, VercelAIAdapter<T, TTools>> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: AdaptOptions
  ): Promise<VercelAIObjectPrompt<T, K, TTools>>;
}

// Accept a wider loader shape for compatibility across versions.
// Uses method signature syntax (bivariant) to allow concrete loader implementations
// (e.g. ApiLoader) whose options parameter is a more specific type.
export type LoaderLike<_D> = {
  load(path: string, kind: PromptKind, options?: AdaptOptions): Promise<unknown>;
  loadDataset(datasetPath: string): Promise<ReadableStream<{ input: Record<string, unknown>; expected_output?: string }>>;
};

export function createAgentMarkClient<
  D extends PromptShape<D> = PromptShape<Record<string, never>>,
  TTools extends Record<string, Tool> = Record<string, Tool>
>(opts: {
  loader?: LoaderLike<D>;
  modelRegistry: VercelAIModelRegistry;
  tools?: TTools;
  evalRegistry?: EvalRegistry;
  mcpServers?: McpServers;
}): VercelAgentMark<D, TTools> {
  const adapter = new VercelAIAdapter<D, TTools>(
    opts.modelRegistry,
    opts.tools,
    opts.mcpServers
  );

  return new AgentMark<D, VercelAIAdapter<D, TTools>>({
    // Cast internally to the precise Loader shape used by AgentMark
    loader: opts.loader as unknown as Loader<D>,
    adapter,
    evalRegistry: opts.evalRegistry,
  }) as unknown as VercelAgentMark<D, TTools>;
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
} from "./adapter.js";

export type { McpServers } from "@agentmark-ai/prompt-core";

export type { EvalRegistry } from "@agentmark-ai/prompt-core";

export type { FormatWithDatasetOptions } from "@agentmark-ai/prompt-core";
