import {
  ChatCompletionCreateParams,
} from "openai/resources";
import { IPluginAPI, IModelPlugin, AgentMark, AgentMarkOutput } from "@puzzlet/agentmark";
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
  

  async deserialize(agentMark: AgentMark, api: IPluginAPI): Promise<ChatCompletionCreateParams> {
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
          await api.runInference(modelConfig.settings, providerModel, messages);
        } catch (e) {}
      }
    );
    const result = await completionParamsPromise;
    return result;
  }

  async runInference(agentMark: AgentMark, api: IPluginAPI): Promise<AgentMarkOutput> {
    const apiKey = this.apiKey || api.getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      throw new Error("No API key provided");
    }
    const openai = createOpenAI({
      compatibility: 'strict',
      apiKey,
      fetch: api.fetch
    });
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = openai(modelConfig.name);
    const result = await api.runInference(modelConfig.settings, providerModel, messages);
    return result;
  }
}