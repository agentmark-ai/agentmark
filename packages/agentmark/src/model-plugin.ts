import { JSONObject, AgentMarkOutput, AgentMark } from "./types";
import type { IPluginAPI } from './plugin-api';

export abstract class ModelPlugin<T = JSONObject, R = T> {
  protected apiKey: string | undefined = "";
  protected api: IPluginAPI;

  provider: string;

  constructor(provider: string, api: IPluginAPI) {
    this.provider = provider;
    this.api = api;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  abstract deserialize(AgentMark: AgentMark): Promise<R>;

  abstract runInference(agentMark: AgentMark): Promise<AgentMarkOutput>;

  abstract serialize(completionParams: R, name: string): string;
}
