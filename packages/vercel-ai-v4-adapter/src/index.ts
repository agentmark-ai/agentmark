import { Loader, PromptShape } from "@agentmark/agentmark-core";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "./adapter";
import { VercelAgentMark } from "./vercel-agentmark";

export function createAgentMarkClient<D extends PromptShape<D>>(opts: {
  loader?: Loader<D>;
  modelRegistry: VercelAIModelRegistry;
  toolRegistry?: VercelAIToolRegistry<any, any>;
}) {
  const adapter = new VercelAIAdapter<D>(opts.modelRegistry, opts.toolRegistry);

  return new VercelAgentMark<D>({
    loader: opts.loader,
    adapter,
  });
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "./adapter";
