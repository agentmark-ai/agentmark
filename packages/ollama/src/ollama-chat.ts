import type {
  IPluginAPI,
  IModelPlugin,
  InferenceOptions,
  AgentMarkOutput,
  AgentMark,
  AgentMarkStreamOutput,
  DeserializeConfig,
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
            await api.streamInference(modelConfig.settings, providerModel, messages);
          } else {
            await api.runInference(modelConfig.settings, providerModel, messages);
          }
        } catch (e) {}
      }
    );
    return completionParamsPromise;
  }

  async runInference(
    agentMark: AgentMark,
    api: IPluginAPI,
    options?: InferenceOptions
  ): Promise<AgentMarkOutput> {
    const ollama = createOllama({ fetch: api.fetch });
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    const result = await api.runInference(
      modelConfig.settings,
      providerModel,
      messages,
      options
    );
    return result;
  }

  async streamInference(agentMark: AgentMark, api: IPluginAPI, options?: InferenceOptions): Promise<AgentMarkStreamOutput<any>> {
    const ollama = createOllama({ fetch: api.fetch });
    const { metadata, messages } = agentMark;
    const { model: modelConfig } = metadata;
    const providerModel = ollama(modelConfig.name);
    return api.streamInference(
      modelConfig.settings,
      providerModel,
      messages,
      options
    );
  }
}
