import {
  AgentMark,
  AgentMarkOptions,
  PromptShape,
  KeysWithKind,
} from "@agentmark/agentmark-core";
import { VercelAIAdapter } from "./adapter";
import { VercelAIObjectPrompt } from "./object-prompt";

export class VercelAgentMark<T extends PromptShape<T>> extends AgentMark<
  T,
  VercelAIAdapter<T>
> {
  constructor(opts: AgentMarkOptions<T, VercelAIAdapter<T>>) {
    super(opts);
  }

  loadObjectPrompt<K extends KeysWithKind<T, "object"> & string>(
    pathOrPreloaded: K,
    options?: any
  ): Promise<VercelAIObjectPrompt<T, K>> {
    return super.loadObjectPrompt(pathOrPreloaded, options);
  }
}
