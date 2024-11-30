import { JSONObject, AgentMarkOutput, PromptDX } from "./types";
import type { PluginAPI } from './plugin-api';

export abstract class ModelPlugin<T = JSONObject, R = T> {
  protected apiKey: string | undefined = "";
  protected api: PluginAPI;

  provider: string;

  constructor(provider: string, api: PluginAPI) {
    this.provider = provider;
    this.api = api;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  abstract deserialize(PromptDX: PromptDX): Promise<R>;

  abstract runInference(promptDX: PromptDX): Promise<AgentMarkOutput>;

  abstract serialize(completionParams: R, name: string): string;
}
