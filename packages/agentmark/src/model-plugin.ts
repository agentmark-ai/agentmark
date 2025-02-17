import { JSONObject, AgentMark, InferenceOptions, DeserializeConfig, GenerateObjectOutput, GenerateTextOutput, StreamObjectOutput, StreamTextOutput } from "./types";
import type { IPluginAPI } from './plugin-api';

export interface IModelPlugin<T = JSONObject, R = T> {
  provider: string;

  setApiKey(apiKey: string): void;

  deserialize(agentMark: AgentMark, api: IPluginAPI, config?: DeserializeConfig): Promise<R>;

  generateObject<OBJECT extends any>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateObjectOutput<OBJECT>>;

  generateText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateTextOutput>;

  streamObject<OBJECT extends any>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamObjectOutput<OBJECT>>;

  streamText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamTextOutput>;

  serialize(completionParams: R, name: string, api: IPluginAPI): string;
}