import { GEMINI_MODEL } from "@llamaindex/google";

type ModelFactory = (name: string) => any;

export class LlamaIndexModelRegistry {
  private models: Record<string, ModelFactory> = {};

  registerModels(modelNames: string[], factory: ModelFactory) {
    for (const name of modelNames) {
      this.models[name] = factory;
    }
  }

  getModel(name: string) {
    const factory = this.models[name];
    if (!factory) throw new Error(`Model "${name}" not registered.`);
    return factory(name as GEMINI_MODEL);
  }
}
