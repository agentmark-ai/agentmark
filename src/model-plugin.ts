import { JSONObject, PromptDXOutput, PromptDX, InferenceOptions } from "./types";

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

  abstract runInference(promptDX: PromptDX, options?: InferenceOptions): Promise<PromptDXOutput>;

  abstract serialize(completionParams: R, name: string): string;
}
