import { AgentMark, Loader, PromptShape } from '@agentmark/agentmark-core';
import { DefaultAdapter } from './adapter';


export function createAgentMarkClient<
  D extends PromptShape<D>,
>(opts: {
  loader?: Loader<D>;
}) {
  const adapter = new DefaultAdapter<D>();

  return new AgentMark<D, typeof adapter>({
    loader : opts.loader,
    adapter,
  });
}

export {
  DefaultAdapter
} from "./adapter";