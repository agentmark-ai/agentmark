import {
  ChatCompletionCreateParams,
} from "openai/resources";
import { ModelPlugin } from "../model-plugin";
import { PromptDX } from "../types";
import { getEnv, toFrontMatter, getInferenceConfig, runInference } from "../utils";
import { Output } from "../types";
import { createOpenAI } from "@ai-sdk/openai";

export default class OpenAIChatPlugin extends ModelPlugin<ChatCompletionCreateParams> {
  private customFetch;
  constructor(customFetch = fetch) {
    super("openai");
    this.customFetch = customFetch;
  }

  serialize(
    completionParams: ChatCompletionCreateParams,
    name: string
  ): string {
    const { model, messages, tools, stream_options, tool_choice, ...settings } = completionParams;
    const frontMatterData: any = {
      name: name,
      metadata: {
        model: {
          name: model,
          settings: settings || {},
        },
      },
    };
  
    if (tools) {
      const transformedTools = tools.reduce((acc: any, { function: func }) => {
        acc[func.name] = {
          description: func.description,
          parameters: func.parameters,
        };
        return acc;
      }, {});
  
      if (tool_choice === 'auto') {
        frontMatterData.metadata.model.settings.tools = transformedTools;
      } else {
        const schemaTool = tools.find((tool) => tool.function.parameters);
        if (schemaTool) {
          frontMatterData.metadata.model.settings.schema = schemaTool.function.parameters;
        }
      }
    }
  
    const frontMatter = toFrontMatter(frontMatterData);
    const messageBody = messages
      .map((message) => {
        const role = message.role;
        const JSXTag = role.charAt(0).toUpperCase() + role.slice(1);
        return `<${JSXTag}>${message.content}</${JSXTag}>`;
      })
      .join("\n");
  
    return `${frontMatter}\n${messageBody}`;
  }
  

  async deserialize(promptDX: PromptDX): Promise<ChatCompletionCreateParams> {
    const { metadata, messages } = promptDX;
    const { model: modelConfig } = metadata;
    const completionParamsPromise = new Promise<ChatCompletionCreateParams>(
      async (resolve) => {
        const openai = createOpenAI({
          compatibility: 'strict',
          fetch: async (_, options) => {
            const requestBody = JSON.parse(options!.body! as string);
            resolve(requestBody as ChatCompletionCreateParams);
            return new Response();
          },
        });
        const providerModel = openai(modelConfig.name);
        const { config, options } = getInferenceConfig(providerModel, messages, modelConfig.settings);
        // Swallow any errors here. We only care about the deserialized inputs.
        try {
          await runInference(config, options);
        } catch (e) {}
      }
    );
    const result = await completionParamsPromise;
    return result;
  }

  async runInference(promptDX: PromptDX): Promise<Output> {
    const apiKey = this.apiKey || getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("No API key provided");
    }
    const openai = createOpenAI({
      compatibility: 'strict',
      apiKey,
      fetch: this.customFetch
    });
    const { metadata, messages } = promptDX;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const { config, options } = getInferenceConfig(providerModel, messages, modelConfig.settings);
    const result = await runInference(config, options);
    return result;
  }
}