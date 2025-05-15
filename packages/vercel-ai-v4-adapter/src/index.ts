import { AgentMark, Loader, PromptShape } from '@agentmark/agentmark-core';
import { VercelAIAdapter, VercelAIModelRegistry, VercelAIToolRegistry } from './adapter';

export function createAgentMarkClient<
  D extends PromptShape<D>,
>(opts: {
  loader?: Loader<D>;
  modelRegistry: VercelAIModelRegistry;
  toolRegistry?: VercelAIToolRegistry<any, any>;
}) {
  const adapter = new VercelAIAdapter<D>(opts.modelRegistry, opts.toolRegistry);

  return new AgentMark<D, typeof adapter>({
    loader : opts.loader,
    adapter,
  });
}

export {
  VercelAIAdapter,
  VercelAIModelRegistry,
  VercelAIToolRegistry
} from "./adapter";