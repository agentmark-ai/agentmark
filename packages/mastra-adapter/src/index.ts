import type { PromptShape, Loader } from "@agentmark/agentmark-core";
import { AgentMark } from "@agentmark/agentmark-core";
import { MastraAdapter, MastraAgentMark } from "./adapter";
import { MastraModelRegistry } from "./model-registry";
import { MastraToolRegistry } from "./tool-registry";

export function createAgentMarkClient<D extends PromptShape<D> = any>(opts: {
  loader?: Loader<D>;
  modelRegistry: MastraModelRegistry;
  toolRegistry?: MastraToolRegistry; // Use proper type
}): MastraAgentMark<D> {
  return new MastraAgentMark<D>({
    loader: opts.loader,
    modelRegistry: opts.modelRegistry,
    toolRegistry: opts.toolRegistry, // Pass through tool registry
  });
}

export { MastraAdapter } from "./adapter";
export { MastraModelRegistry } from "./model-registry";
export { MastraToolRegistry } from "./tool-registry";
