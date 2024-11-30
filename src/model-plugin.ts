import { JSONObject, AgentMarkOutput, AgentMark } from "./types";

export abstract class ModelPlugin<T = JSONObject, R = T> {
  protected apiKey: string | undefined = "";

  provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  abstract deserialize(AgentMark: AgentMark): Promise<R>;

  abstract runInference(agentMark: AgentMark): Promise<AgentMarkOutput>;

  abstract serialize(completionParams: R, name: string): string;
}
