import { JSONObject, AgentMarkOutput, AgentMark, InferenceOptions, AgentMarkStreamOutput } from "./types";
import type { IPluginAPI } from './plugin-api';

export interface IModelPlugin<T = JSONObject, R = T> {
  provider: string;

  setApiKey(apiKey: string): void;

  deserialize(agentMark: AgentMark, api: IPluginAPI): Promise<R>;

  runInference(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<AgentMarkOutput>;

  streamInference(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<AgentMarkStreamOutput>;

  serialize(completionParams: R, name: string, api: IPluginAPI): string;
}