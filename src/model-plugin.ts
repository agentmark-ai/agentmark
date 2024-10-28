import { PromptDX } from "./runtime";
import { JSONObject, Output } from "./types";

export abstract class ModelPlugin<T = JSONObject, R = T> {
  protected apiKey: string | undefined = "";

  provider: string;

  constructor(provider: string) {
    this.provider = provider;
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  abstract deserialize(PromptDX: PromptDX): R;

  abstract runInference(completionParams: R): Promise<Output[]>;

  abstract serialize(completionParams: R, name: string): string;

  async run(promptDX: PromptDX) {
    const completionParams = this.deserialize(promptDX);
    const result = await this.runInference(completionParams);
    return result;
  }
}
