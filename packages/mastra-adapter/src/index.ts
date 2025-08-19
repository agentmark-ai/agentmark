import type { Loader, PromptShape } from "@agentmark/agentmark-core";
import { MastraModelRegistry } from "./model-registry";
import { MastraToolRegistry } from "./tool-registry";
import { MastraAdapter } from "./adapter";
import { MastraAgentMark } from "./mastra-agentmark";

export function createAgentMarkClient<
  D extends PromptShape<D> | undefined = undefined,
  TTools extends MastraToolRegistry<any, any> = MastraToolRegistry<any, any>
>(opts: {
  loader?: Loader<any>;
  modelRegistry?: MastraModelRegistry;
  toolRegistry?: TTools;
}): MastraAgentMark<D, TTools, MastraAdapter<D, TTools>> {
  const adapter = new MastraAdapter<D, TTools>(
    opts.modelRegistry ?? new MastraModelRegistry(),
    opts.toolRegistry
  );
  return new MastraAgentMark<D, TTools, MastraAdapter<D, TTools>>({
    loader: opts.loader,
    adapter,
  });
}

export { MastraModelRegistry } from "./model-registry";
export { MastraToolRegistry } from "./tool-registry";

