import {
  ChatCompletionCreateParams,
} from "openai/resources";
import { ModelPlugin } from "../model-plugin";
import { PromptDX } from "../runtime";
import { getEnv, toFrontMatter, transformKeysToCamelCase, transformParameters } from "../utils";
import { Output } from "../types";
import { generateText, generateObject, jsonSchema, streamObject, streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

export class OpenAIChatPlugin extends ModelPlugin<ChatCompletionCreateParams> {
  private customFetch;
  constructor(customFetch = fetch) {
    super("openai");
    this.customFetch = customFetch;
  }

  serialize(
    completionParams: ChatCompletionCreateParams,
    name: string
  ): string {
    const { model, messages, tools, tool_choice, ...settings } = completionParams;
    const frontMatterData: any = {
      name: name,
      metadata: {
        model: {
          name: model,
          settings,
        },
      },
    };
    if (Object.keys(settings).length > 0 || tools) {
      if (tools) {
        const transformedTools = tools.reduce((acc: any, { function: func }) => {
          acc[func.name] = {
            description: func.description,
            parameters: func.parameters,
          };
          return acc;
        }, {});
        frontMatterData.metadata.model.settings.tools = transformedTools;
      }
    }
    function convertToolChoice(toolChoice: any) {
      if (typeof toolChoice === 'string') {
        if (['auto', 'required', 'none'].includes(toolChoice)) {
          return toolChoice;
        }
        throw new Error(`Invalid tool_choice value: ${toolChoice}`);
      }
      if (typeof toolChoice === 'object' && toolChoice.type === 'function' && toolChoice.function?.name) {
        return {
          type: 'tool',
          tool_name: toolChoice.function.name
        };
      }
      throw new Error('Invalid tool_choice format.');
    }
    if (tool_choice) {
      frontMatterData.metadata.model.settings.tool_choice = convertToolChoice(tool_choice);
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
        const { config, options } = this.getExecutionParams(providerModel, messages, modelConfig.settings);
        // Swallow any errors here. We only care about the deserialized inputs.
        try {
          await this.execute(config, options);
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
    const { config, options } = this.getExecutionParams(providerModel, messages, modelConfig.settings);
    const result = await this.execute(config, options);
    return result;
  }

  private getExecutionParams(providerModel: any, messages: any, { stream, ...settings }: any): any {
    const config = { model: providerModel, messages, ...transformKeysToCamelCase(settings) };
    if (config.tools) {
      config.tools = transformParameters(config.tools);
    }
    if (config.schema) {
      config.schema = jsonSchema(config.schema);
    }
    const options = { stream: !!stream, hasSchema: !!config.schema }
    return { config, options };
  }

  private async execute(config: any, options: any): Promise<Output> {
    const { hasSchema, stream } = options;
    if (hasSchema && stream) {
      return new Promise(async (resolve, reject) => {
        try {
          const { textStream } = streamObject({
            ...config,
            onFinish({ object, usage }) {
              resolve({
                result: { data: object as Object, type: 'text' },
                tools: [],
                usage,
                finishReason: 'unknown'
              });
            },
          });
          for await (const _ of textStream);
        } catch (error) {
          reject(error);
        }
      });
    } else if (hasSchema) {
      const result = await generateObject(config);
      return {
        result: { data: result.object as Object, type: 'object' },
        tools: [],
        usage: result.usage,
        finishReason: result.finishReason
      }
    } else if (stream) {
      return new Promise(async (resolve, reject) => {
        try {
          const { textStream } = streamText({
            ...config,
            onFinish({ text, usage, toolCalls, finishReason }) {
              resolve({
                result: { data: text as string, type: 'text' },
                tools: toolCalls.map((tool) => ({ name: tool.toolName, input: tool.args })),
                usage,
                finishReason
              });
            },
          });
          for await (const _ of textStream);
        } catch (error) {
          reject(error);
        }
      });
    } else {
      const result = await generateText(config);
      return {
        result: { data: result.text as string, type: 'text' },
        tools: result.toolCalls.map((tool) => ({ name: tool.toolName, input: tool.args })),
        usage: result.usage,
        finishReason: result.finishReason
      }
    }
  }
}
