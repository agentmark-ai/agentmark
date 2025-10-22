import type { Loader, PromptShape } from "../../prompt-core/dist";
import { MastraModelRegistry } from "./model-registry";
import { MastraToolRegistry } from "./tool-registry";
import { MastraAdapter } from "./adapter";
import type { McpServers } from "../../prompt-core/dist";
import { MastraAgentMark } from "./mastra-agentmark";

export function createAgentMarkClient<
  D extends PromptShape<D> | undefined = undefined,
  TTools extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
>(opts: {
  loader?: Loader<any>;
  modelRegistry?: MastraModelRegistry;
  toolRegistry?: TTools;
  mcpServers?: McpServers;
}): MastraAgentMark<D, TTools, MastraAdapter<D, TTools>> {
  const adapter = new MastraAdapter<D, TTools>(
    opts.modelRegistry ?? new MastraModelRegistry(),
    opts.toolRegistry,
    opts.mcpServers
  );
  return new MastraAgentMark<D, TTools, MastraAdapter<D, TTools>>({
    loader: opts.loader,
    adapter,
  });
}

export { MastraModelRegistry } from "./model-registry";
export { MastraToolRegistry } from "./tool-registry";

