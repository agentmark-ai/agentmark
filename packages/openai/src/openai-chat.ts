import {
  ChatCompletionCreateParams,
} from "openai/resources";
import type { IPluginAPI, IModelPlugin, InferenceOptions, AgentMark, DeserializeConfig, GenerateObjectOutput, GenerateTextOutput, StreamObjectOutput, StreamTextOutput } from "@puzzlet/agentmark";
import { createOpenAI } from "@ai-sdk/openai";

export default class OpenAIChatPlugin implements IModelPlugin {
  provider: string;
  apiKey: string | undefined = "";
  constructor() {
    this.provider = "openai";
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }


  serialize(
    completionParams: ChatCompletionCreateParams,
    name: string,
    api: IPluginAPI
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
  
    const frontMatter = api.toFrontMatter(frontMatterData);
    const messageBody = messages
      .map((message) => {
        const role = message.role;
        const JSXTag = role.charAt(0).toUpperCase() + role.slice(1);
        return `<${JSXTag}>${message.content}</${JSXTag}>`;
      })
      .join("\n");
  
    return `${frontMatter}\n${messageBody}`;
  }
  

  async deserialize(agentMark: AgentMark, api: IPluginAPI, config?: DeserializeConfig): Promise<ChatCompletionCreateParams> {
    const { metadata, messages } = agentMark;
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
        // Swallow any errors here. We only care about the deserialized inputs.
        try {
          if (config?.withStream) {
            if("schema" in modelConfig.settings) {
                await api.streamObject(modelConfig.settings, providerModel, messages);
              } else {
                await api.streamText(modelConfig.settings, providerModel, messages);
            }
          } else {
            if("schema" in modelConfig.settings) {
              await api.generateObject(modelConfig.settings, providerModel, messages);
            } else {
              await api.generateText(modelConfig.settings, providerModel, messages);
            }
          }
        } catch (e) {}
      }
    );
    return completionParamsPromise;
  }

  private createOpenAIClient(api: IPluginAPI, options?: InferenceOptions) {
    const apiKey = options?.apiKey || this.apiKey || api.getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("No API key provided");
    }
    return createOpenAI({
      compatibility: 'strict',
      apiKey,
      fetch: api.fetch
    });
  }

  async generateObject<OBJECT>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateObjectOutput<OBJECT>> {
    const openai = this.createOpenAIClient(api, options);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const result = await api.generateObject(modelConfig.settings, providerModel, messages, options);
    return result as GenerateObjectOutput<OBJECT>;
  }

  async generateText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateTextOutput> {
    const openai = this.createOpenAIClient(api, options);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const result = await api.generateText(modelConfig.settings, providerModel, messages, options);
    return result as GenerateTextOutput;
  }

  async streamObject<OBJECT>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamObjectOutput<OBJECT>> {
    const openai = this.createOpenAIClient(api, options);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const result = await api.streamObject(modelConfig.settings, providerModel, messages, options);
    return result as StreamObjectOutput<OBJECT>;
  }

  async streamText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamTextOutput> {
    const openai = this.createOpenAIClient(api, options);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const result = await api.streamText(modelConfig.settings, providerModel, messages, options);
    return result as StreamTextOutput;
  }
}
