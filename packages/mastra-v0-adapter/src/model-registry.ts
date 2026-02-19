import type { AdaptOptions } from "@agentmark-ai/prompt-core";

export type ModelFunctionCreator = (modelName: string, options?: AdaptOptions) => any;

export class MastraModelRegistry {
	private exactMatches: Record<string, ModelFunctionCreator> = {};
	private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
	private defaultCreator?: ModelFunctionCreator;
	private providers: Record<string, any> = {};

	constructor(defaultCreator?: ModelFunctionCreator) {
		this.defaultCreator = defaultCreator;
	}

	registerModels(modelPattern: string | RegExp | Array<string>, creator: ModelFunctionCreator): MastraModelRegistry {
		if (typeof modelPattern === "string") {
			this.exactMatches[modelPattern] = creator;
		} else if (Array.isArray(modelPattern)) {
			for (const m of modelPattern) this.exactMatches[m] = creator;
		} else {
			this.patternMatches.push([modelPattern, creator]);
		}
		return this;
	}

	registerProviders(providers: Record<string, any>): MastraModelRegistry {
		Object.assign(this.providers, providers);
		return this;
	}

	getModelFunction(
		modelName: string,
		modelType?: "languageModel" | "imageModel" | "speechModel"
	): ModelFunctionCreator {
		// 1. Exact match
		if (this.exactMatches[modelName]) return this.exactMatches[modelName];

		// 2. Pattern match
		for (const [re, creator] of this.patternMatches) if (re.test(modelName)) return creator;

		// 3. Provider auto-resolution
		if (modelName.includes("/")) {
			const slashIndex = modelName.indexOf("/");
			const providerName = modelName.substring(0, slashIndex);
			const modelId = modelName.substring(slashIndex + 1);

			if (!providerName || !modelId) {
				throw new Error(`Invalid model name format: '${modelName}'. Expected 'provider/model'.`);
			}

			const provider = this.providers[providerName];
			if (!provider) {
				throw new Error(`Provider '${providerName}' is not registered. Add .registerProviders({ ${providerName} }) to your model registry.`);
			}

			const type = modelType ?? "languageModel";
			const factory = provider[type];
			if (typeof factory !== "function") {
				throw new Error(`Provider '${providerName}' does not support ${type} models. The model '${modelName}' cannot be created as a ${type}.`);
			}

			return () => factory.call(provider, modelId);
		}

		// 4. Default creator
		if (this.defaultCreator) return this.defaultCreator;

		// 5. Error
		throw new Error(`No model function found for: '${modelName}'. Register it with .registerModels() or use provider/model format with .registerProviders().`);
	}
} 