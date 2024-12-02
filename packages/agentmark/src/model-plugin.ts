import { JSONObject, AgentMarkOutput, AgentMark } from "./types";
import type { IPluginAPI } from './plugin-api';

export interface IModelPlugin<T = JSONObject, R = T> {
  provider: string;

  setApiKey(apiKey: string): void;

  deserialize(agentMark: AgentMark, api: IPluginAPI): Promise<R>;

  runInference(agentMark: AgentMark, api: IPluginAPI): Promise<AgentMarkOutput>;

  serialize(completionParams: R, name: string, api: IPluginAPI): string;
}