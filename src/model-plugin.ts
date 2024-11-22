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

  abstract deserialize(PromptDX: PromptDX): Promise<R>;

  abstract runInference(promptDX: PromptDX): Promise<Output>;

  abstract serialize(completionParams: R, name: string): string;
}
