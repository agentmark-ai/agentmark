import type { Loader, PromptShape, EvalRegistry } from "@agentmark-ai/prompt-core";
import { MastraModelRegistry } from "./model-registry";
import { MastraAdapter } from "./adapter";
import type { McpServers } from "@agentmark-ai/prompt-core";
import { MastraAgentMark } from "./mastra-agentmark";
import type { ToolsInput } from "@mastra/core/agent";

export function createAgentMarkClient<
  D extends PromptShape<D> | undefined = undefined
>(opts: {
  loader?: Loader<any>;
  modelRegistry?: MastraModelRegistry;
  tools?: ToolsInput;
  /** @deprecated Use evals instead. */
  evalRegistry?: EvalRegistry;
  /** Plain eval functions keyed by name. */
  evals?: EvalRegistry;
  mcpServers?: McpServers;
}): MastraAgentMark<D, MastraAdapter<D, ToolsInput>> {
  const adapter = new MastraAdapter<D, ToolsInput>(
    opts.modelRegistry ?? new MastraModelRegistry(),
    opts.tools,
    opts.mcpServers
  );
  return new MastraAgentMark<D, MastraAdapter<D, ToolsInput>>({
    loader: opts.loader,
    adapter,
    evalRegistry: opts.evalRegistry,
    evals: opts.evals,
  });
}

export { MastraModelRegistry } from "./model-registry";
export { MastraAdapterWebhookHandler } from "./runner";
export type { EvalRegistry } from "@agentmark-ai/prompt-core";

export type { FormatWithDatasetOptions } from "@agentmark-ai/prompt-core";

