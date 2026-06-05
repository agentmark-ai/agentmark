import type { AdaptOptions } from "@agentmark-ai/prompt-core";

/**
 * Version-agnostic model registry shared by the v4 and v5 adapters.
 *
 * The class body was previously duplicated verbatim (~80 LOC) in both
 * adapters; the only difference was the `ai`-version model types it was
 * written against. Like the executor factory, this package takes no
 * type-level dependency on either `ai` major — `TModel` is supplied by the
 * consuming adapter (`LanguageModel | ImageModel | SpeechModel` from its
 * pinned version), which subclasses/re-exports a concretely-typed
 * `VercelAIModelRegistry`.
 */

export type ModelFunctionCreator<TModel = unknown> = (
  modelName: string,
  options?: AdaptOptions
) => TModel;

export type VercelModelProvider<TModel = unknown> = {
  languageModel?: (modelId: string) => TModel;
  imageModel?: (modelId: string) => TModel;
  speechModel?: (modelId: string) => TModel;
};

export class VercelAIModelRegistry<TModel = unknown> {
  private exactMatches: Record<string, ModelFunctionCreator<TModel>> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator<TModel>]> = [];
  private defaultCreator?: ModelFunctionCreator<TModel>;
  private providers: Record<string, VercelModelProvider<TModel>> = {};

  constructor(defaultCreator?: ModelFunctionCreator<TModel>) {
    this.defaultCreator = defaultCreator;
  }

  registerModels(
    modelPattern: string | RegExp | Array<string>,
    creator: ModelFunctionCreator<TModel>
  ): this {
    if (typeof modelPattern === "string") {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach((model) => {
        this.exactMatches[model] = creator;
      });
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
    return this;
  }

  registerProviders(providers: Record<string, VercelModelProvider<TModel>>): this {
    Object.assign(this.providers, providers);
    return this;
  }

  getModelFunction(
    modelName: string,
    modelType?: "languageModel" | "imageModel" | "speechModel"
  ): ModelFunctionCreator<TModel> {
    if (this.exactMatches[modelName]) return this.exactMatches[modelName];

    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) return creator;
    }

    if (modelName.includes("/")) {
      const slashIndex = modelName.indexOf("/");
      const providerName = modelName.substring(0, slashIndex);
      const modelId = modelName.substring(slashIndex + 1);

      if (!providerName || !modelId) {
        throw new Error(
          `Invalid model name format: '${modelName}'. Expected 'provider/model'.`
        );
      }

      const provider = this.providers[providerName];
      if (!provider) {
        throw new Error(
          `Provider '${providerName}' is not registered. Add .registerProviders({ ${providerName} }) to your model registry.`
        );
      }

      const type = modelType ?? "languageModel";
      const factory = provider[type];
      if (typeof factory !== "function") {
        throw new Error(
          `Provider '${providerName}' does not support ${type} models. The model '${modelName}' cannot be created as a ${type}.`
        );
      }

      const boundFactory = (factory as (modelId: string) => TModel).bind(
        provider
      );
      return () => boundFactory(modelId);
    }

    if (this.defaultCreator) return this.defaultCreator;

    throw new Error(
      `No model function found for: '${modelName}'. Register it with .registerModels() or use provider/model format with .registerProviders().`
    );
  }
}
