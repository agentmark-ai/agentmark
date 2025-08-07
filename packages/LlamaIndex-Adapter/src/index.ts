import type { PromptShape, Loader } from "@agentmark/agentmark-core";
import { AgentMark } from "@agentmark/agentmark-core";
import { LlamaIndexAdapter, LlamaAgentmark } from "./adapter";
import { LlamaIndexModelRegistry } from "./model-registry";
import { LlamaIndexToolRegistry } from "./tool-registry";
export function createAgentMarkClient<D extends PromptShape<D> = any>(opts: {
  loader?: Loader<D>;
  modelRegistry: LlamaIndexModelRegistry;
  toolRegistry?: LlamaIndexToolRegistry; // Use proper type
}): LlamaAgentmark<D> {
  return new LlamaAgentmark<D>({
    loader: opts.loader,
    modelRegistry: opts.modelRegistry,
    toolRegistry: opts.toolRegistry, // Pass through tool registry
  });
}

export { LlamaIndexAdapter } from "./adapter";
export { LlamaIndexModelRegistry } from "./model-registry";
export { LlamaIndexToolRegistry } from "./tool-registry";
