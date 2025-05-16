import { AgentMark, Loader, PromptShape } from '@agentmark/agentmark-core';
import { DefaultAdapter, DefaultAgentmark } from './adapter';


export function createAgentMarkClient<
  D extends PromptShape<D>,
>(opts: {
  loader?: Loader<D>;
}) {
  const adapter = new DefaultAdapter<D>();

  return new DefaultAgentmark<D>({
    loader: opts.loader,
    adapter,
  });
}

export {
  DefaultAdapter
} from "./adapter";