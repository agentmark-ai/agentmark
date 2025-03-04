import type {
  TextConfig,
  ObjectConfig,
  ImageConfig,
  Adapter
} from "../types";
import { generateText, generateObject, experimental_generateImage, LanguageModel, ImageModel, jsonSchema } from "ai";

type VercelTextParams = Partial<Parameters<typeof generateText>[0]>;
type VercelObjectParams = Partial<Parameters<typeof generateObject>[0]>;
type VercelImageParams = Partial<Parameters<typeof experimental_generateImage>[0]>;

export type ModelFunctionCreator = (modelName: string, options?: Record<string, any>) => LanguageModel | ImageModel;

interface ModelRegistry {
  getModelFunction(modelName: string): ModelFunctionCreator;
  registerModel(modelPattern: string | RegExp, creator: ModelFunctionCreator): void;
}

export class VercelModelRegistry {
  private exactMatches: Record<string, ModelFunctionCreator> = {};
  private patternMatches: Array<[RegExp, ModelFunctionCreator]> = [];
  private defaultCreator?: ModelFunctionCreator;

  constructor(defaultCreator?: ModelFunctionCreator) {
    this.defaultCreator = defaultCreator;
  }

  registerModel(modelPattern: string | RegExp | Array<string>, creator: ModelFunctionCreator): void {
    if (typeof modelPattern === 'string') {
      this.exactMatches[modelPattern] = creator;
    } else if (Array.isArray(modelPattern)) {
      modelPattern.forEach(model => this.exactMatches[model] = creator);
    } else {
      this.patternMatches.push([modelPattern, creator]);
    }
  }

  getModelFunction(modelName: string): ModelFunctionCreator {
    if (this.exactMatches[modelName]) {
      return this.exactMatches[modelName];
    }

    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) {
        return creator;
      }
    }

    if (this.defaultCreator) {
      return this.defaultCreator;
    }

    throw new Error(`No model function found for: ${modelName}`);
  }

  registerModels(mappings: Record<string, ModelFunctionCreator>): void {
    for (const [pattern, creator] of Object.entries(mappings)) {
      this.registerModel(pattern, creator);
    }
  }

  setDefaultCreator(creator: ModelFunctionCreator): void {
    this.defaultCreator = creator;
  }
}

function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  ) as Partial<T>;
}

export class VercelAdapter implements Adapter<VercelTextParams, VercelObjectParams, VercelImageParams> {
  constructor(private modelRegistry: ModelRegistry) {
    this.modelRegistry = modelRegistry;
  }

  adaptText(input: TextConfig, runtimeConfig: Record<string, any> = {}): Partial<VercelTextParams> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);

    const model = modelCreator(input.metadata.model.name, runtimeConfig) as LanguageModel;
    return removeUndefined({
      model: model,
      messages: input.messages,
      temperature: input.metadata.model.settings?.temperature,
      maxTokens: input.metadata.model.settings?.max_tokens,
      topP: input.metadata.model.settings?.top_p,
      frequencyPenalty: input.metadata.model.settings?.frequency_penalty,
      presencePenalty: input.metadata.model.settings?.presence_penalty,
      seed: input.metadata.model.settings?.seed,
      tools: input.metadata.model.settings?.tools ?
        Object.fromEntries(
          Object.entries(input.metadata.model.settings.tools).map(([name, tool]) => [
            name,
            {
              description: tool.description,
              parameters: tool.parameters ? jsonSchema(tool.parameters) : undefined
            }
          ])
        ) : undefined,
    });
  }

  adaptObject(input: ObjectConfig, runtimeConfig: Record<string, any> = {}): Partial<VercelObjectParams> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);

    const model = modelCreator(input.metadata.model.name, runtimeConfig) as LanguageModel;
    return removeUndefined({
      model: model,
      messages: input.messages,
      temperature: input.metadata.model.settings?.temperature,
      maxTokens: input.metadata.model.settings?.max_tokens,
      topP: input.metadata.model.settings?.top_p,
      frequencyPenalty: input.metadata.model.settings?.frequency_penalty,
      presencePenalty: input.metadata.model.settings?.presence_penalty,
      // @ts-ignore
      schema: input.metadata.model.settings?.schema && jsonSchema(input.metadata.model.settings.schema),
      schemaName: input.metadata.model.settings?.schema_name,
      schemaDescription: input.metadata.model.settings?.schema_description,
      seed: input.metadata.model.settings?.seed
    });
  }

  adaptImage(input: ImageConfig, runtimeConfig: Record<string, any> = {}): Partial<VercelImageParams> {
    const modelCreator = this.modelRegistry.getModelFunction(input.metadata.model.name);

    const model = modelCreator(input.metadata.model.name, runtimeConfig) as ImageModel;
    const prompt = input.messages.map(message => message.content).join('\n');
    return removeUndefined({
      model: model,
      prompt,
      n: input.metadata.model.settings?.num_images,
      size: input.metadata.model.settings?.size as `${number}x${number}` | undefined,
      aspectRatio: input.metadata.model.settings?.aspect_ratio as `${number}:${number}` | undefined,
      seed: input.metadata.model.settings?.seed
    });
  }
}
