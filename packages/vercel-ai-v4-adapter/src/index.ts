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
  Tools extends VercelAIToolRegistry<any, any>,
  Context = any
> extends ObjectPrompt<T, VercelAIAdapter<T, Tools>, K, Context> {
  format(
    params: PromptFormatParams<T[K]["input"]>
  ): Promise<VercelAIObjectParams<T[K]["output"]>>;

  formatWithDataset(options?: AdaptOptions): Promise<
    ReadableStream<{
      dataset: {
        input: Record<string, any>;
        expected_output?: string;
      };
      formatted: VercelAIObjectParams<T[K]["output"]>;
    }>
  >;

  formatWithTestProps(
    options: AdaptOptions
  ): Promise<VercelAIObjectParams<T[K]["output"]>>;
}

export interface VercelAgentMark<
  T extends PromptShape<T>,
  Tools extends VercelAIToolRegistry<any, any>,
  Context = any
> extends AgentMark<T, VercelAIAdapter<T, Tools>, Context> {
  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K | Root,
    options?: any
  ): Promise<VercelAIObjectPrompt<T, K, Tools, Context>>;
}

class VercelAgentMarkBuilder<
  D extends PromptShape<D> = any,
  Context = unknown,
  T extends VercelAIToolRegistry<any, any> = VercelAIToolRegistry<any, any>
> {
  private loader?: Loader<D, Context>;
  private modelRegistry?: VercelAIModelRegistry;
  private toolRegistry?: T;

  withLoader<C>(loader: Loader<D, C>): VercelAgentMarkBuilder<D, C, T> {
    const builder = new VercelAgentMarkBuilder<D, C, T>();
    builder.loader = loader;
    builder.modelRegistry = this.modelRegistry;
    builder.toolRegistry = this.toolRegistry;
    return builder;
  }

  withModelRegistry(modelRegistry: VercelAIModelRegistry): VercelAgentMarkBuilder<D, Context, T> {
    const builder = new VercelAgentMarkBuilder<D, Context, T>();
    builder.loader = this.loader;
    builder.modelRegistry = modelRegistry;
    builder.toolRegistry = this.toolRegistry;
    return builder;
  }

  withToolRegistry<NewT extends VercelAIToolRegistry<any, any>>(
    toolRegistry: NewT
  ): VercelAgentMarkBuilder<D, Context, NewT> {
    const builder = new VercelAgentMarkBuilder<D, Context, NewT>();
    builder.loader = this.loader;
    builder.modelRegistry = this.modelRegistry;
    builder.toolRegistry = toolRegistry;
    return builder;
  }

  build(): VercelAgentMark<D, T, Context> {
    if (!this.loader) {
      throw new Error("Loader is required. Use withLoader() before build()");
    }
    if (!this.modelRegistry) {
      throw new Error("ModelRegistry is required. Use withModelRegistry() before build()");
    }

    const adapter = new VercelAIAdapter<D, T>(this.modelRegistry, this.toolRegistry);
    return new AgentMark({
      loader: this.loader,
      adapter,
    }) as VercelAgentMark<D, T, Context>;
  }
}

export function createAgentMarkBuilder<D extends PromptShape<D> = any>(): VercelAgentMarkBuilder<D> {
  return new VercelAgentMarkBuilder<D>();
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "./adapter";
