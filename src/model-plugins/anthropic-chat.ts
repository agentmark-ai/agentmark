import Anthropic from '@anthropic-ai/sdk';
import { ModelPlugin } from "../model-plugin";
import { AgentMark } from "../types";
import { getEnv, toFrontMatter, runInference } from "../utils";
import { AgentMarkOutput } from "../types";
import { createAnthropic } from "@ai-sdk/anthropic";

type MessageCreateParams = Anthropic.MessageCreateParams;
type ExtendedMessageParam = Omit<Anthropic.MessageParam, "role"> & {
  role: "user" | "assistant" | "system";
}

export default class AnthropicChatPlugin extends ModelPlugin<MessageCreateParams> {
  private customFetch;
  constructor(customFetch = fetch) {
    super("anthropic");
    this.customFetch = customFetch;
  }

  serialize(completionParams: MessageCreateParams, name: string): string {
    const { model, messages, tools, tool_choice, stream, system, ...settings } = completionParams;
    const messagesWithSystem = [...messages] as ExtendedMessageParam[];
    const metadata: any = {
      model: {
        name: model,
        settings: settings || {},
      },
    };
  
    if (system && Array.isArray(system) && system.length) {
      const systemMessages: ExtendedMessageParam[] = system.map((msg) => ({
        role: 'system',
        content: [{ text: msg.text, type: 'text' }],
      }));
      messagesWithSystem.unshift(...systemMessages);
    }
  
    if (stream) {
      metadata.model.settings.stream = true;
    }
  
    if (tools) {
      if (tool_choice?.type === 'auto') {
        metadata.model.settings.tools = tools.reduce((acc: any, tool) => {
          acc[tool.name] = {
            description: tool.description,
            parameters: tool.input_schema || {},
          };
          return acc;
        }, {});
      } else {
        const schemaTool = tools.find((tool) => tool.input_schema);
        if (schemaTool) {
          metadata.model.settings.schema = schemaTool.input_schema;
        }
      }
    }
  
    const frontMatterData = {
      name,
      metadata,
    };
    const frontMatter = toFrontMatter(frontMatterData);
  
    const capitalizeRole = (role: string): string => role.charAt(0).toUpperCase() + role.slice(1);
  
    const messageBody = messagesWithSystem
      .map((message: any) => {
        const roleTag = `<${capitalizeRole(message.role)}>`;
        const content = message.content.map((part: any) => part.text).join(' ');
        return `${roleTag}${content}</${capitalizeRole(message.role)}>`;
      })
      .join('\n');
  
    return `${frontMatter}\n${messageBody}`;
  }
  
  
  async deserialize(agentMark: AgentMark): Promise<MessageCreateParams> {
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;

    const completionParamsPromise = new Promise<MessageCreateParams>(
      async (resolve) => {
        const anthropic = createAnthropic({
          fetch: async (_, options) => {
            const requestBody = JSON.parse(options!.body! as string);
            resolve(requestBody as MessageCreateParams);
            return new Response();
          },
        });
        const providerModel = anthropic(modelConfig.name);
        // Swallow any errors here. We only care about the deserialized inputs.
        try {
          await runInference(modelConfig.settings, providerModel, messages);
        } catch (e) { }
      }
    );
    const result = await completionParamsPromise;
    return result;
  }

  async runInference(agentMark: AgentMark): Promise<AgentMarkOutput> {
    const apiKey = this.apiKey || getEnv("ANTHROPIC_API_KEY");
    if (!apiKey) {
      throw new Error("No API key provided");
    }
    const anthropic = createAnthropic({
      apiKey,
      fetch: this.customFetch
    });
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = anthropic(modelConfig.name);
    const result = await runInference(modelConfig.settings, providerModel, messages);
    return result;
  }
}
