import type { AdaptOptions } from "@agentmark/prompt-core";

export type ModelFunctionCreator = (modelName: string, options?: AdaptOptions) => any;

export class MastraModelRegistry {
	private exactMatches: Record<string, ModelFunctionCreator> = {};
	private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
	private defaultCreator?: ModelFunctionCreator;

	constructor(defaultCreator?: ModelFunctionCreator) {
		this.defaultCreator = defaultCreator;
	}

	registerModels(modelPattern: string | RegExp | Array<string>, creator: ModelFunctionCreator): void {
		if (typeof modelPattern === "string") {
			this.exactMatches[modelPattern] = creator;
		} else if (Array.isArray(modelPattern)) {
			for (const m of modelPattern) this.exactMatches[m] = creator;
		} else {
			this.patternMatches.push([modelPattern, creator]);
		}
	}

	getModelFunction(modelName: string): ModelFunctionCreator {
		if (this.exactMatches[modelName]) return this.exactMatches[modelName];
		for (const [re, creator] of this.patternMatches) if (re.test(modelName)) return creator;
		if (this.defaultCreator) return this.defaultCreator;
		throw new Error(`No model function found for: ${modelName}`);
	}
} 