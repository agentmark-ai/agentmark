import type {
  IPluginAPI,
  IModelPlugin,
  InferenceOptions,
  AgentMark,
  DeserializeConfig,
  GenerateObjectOutput,
  GenerateTextOutput,
  StreamObjectOutput,
  StreamTextOutput,
} from "@puzzlet/agentmark";
import { createOllama } from 'ollama-ai-provider';

export default class OllamaChatPlugin implements IModelPlugin {
  provider: string;
  apiKey: undefined;

  constructor() {
    this.provider = "ollama";
  }

  setApiKey() {
    console.log('*** No-op for now...');
  }

  private createOllamaClient(api: IPluginAPI) {
    return createOllama({ 
      fetch: api.fetch 
    });
  }

  async generateObject<OBJECT>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateObjectOutput<OBJECT>> {
    const ollama = this.createOllamaClient(api);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    const result = await api.generateObject(modelConfig.settings, providerModel, messages, options);
    return result as GenerateObjectOutput<OBJECT>;
  }

  async generateText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<GenerateTextOutput> {
    const ollama = this.createOllamaClient(api);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    const result = await api.generateText(modelConfig.settings, providerModel, messages, options);
    return result as GenerateTextOutput;
  }

  async streamObject<OBJECT>(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamObjectOutput<OBJECT>> {
    const ollama = this.createOllamaClient(api);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    const result = await api.streamObject(modelConfig.settings, providerModel, messages, options);
    return result as StreamObjectOutput<OBJECT>;
  }

  async streamText(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<StreamTextOutput> {
    const ollama = this.createOllamaClient(api);
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    const result = await api.streamText(modelConfig.settings, providerModel, messages, options);
    return result as StreamTextOutput;
  }

  serialize(): string {
    throw new Error('Ollama serialize not implemented for yet. Open a Issue if you need this.');
  }

  async deserialize(agentMark: AgentMark, api: IPluginAPI, config?: DeserializeConfig): Promise<any> {
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const completionParamsPromise = new Promise<any>(
      async (resolve) => {
        const ollama = createOllama({
          fetch: async (_, options) => {
            const requestBody = JSON.parse(options!.body! as string);
            resolve(requestBody);
            return new Response();
          },
        });
        const providerModel = ollama(modelConfig.name);
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
}
