import { getAdapterConfig } from "./adapters.js";

export const getClientConfigContent = (options: { provider: string; languageModels: string[]; adapter: string; deploymentMode?: "cloud" | "static" }) => {
  const { provider, languageModels, adapter, deploymentMode: _deploymentMode = "cloud" } = options;
  const adapterConfig = getAdapterConfig(adapter);
  const { modelRegistry, toolRegistry } = adapterConfig.classes;

  const providerImport = `import { ${provider} } from '@ai-sdk/${provider}';`;

  const extraModelRegs = provider === 'openai'
    ? `.registerModels(["dall-e-3"], (name: string) => ${provider}.image(name))
    .registerModels(["tts-1-hd"], (name: string) => ${provider}.speech(name))`
    : '';

  // For cloud mode, we use AgentMarkLoader which automatically picks the right loader
  // For static mode, we also use AgentMarkLoader - it will use FileLoader when no API key is set
  return `// agentmark.client.ts
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });
import { createAgentMarkClient, ${modelRegistry}, ${toolRegistry}, EvalRegistry } from "${adapterConfig.package}";
import { AgentMarkLoader } from "@agentmark/sdk";
import AgentMarkTypes, { Tools } from './agentmark.types';
${providerImport}

function createModelRegistry() {
  const modelRegistry = new ${modelRegistry}()
    .registerModels(${JSON.stringify(languageModels)}, (name: string) => ${provider}(name))
    ${extraModelRegs};
  return modelRegistry;
}

function createToolRegistry() {
  const toolRegistry = new ${toolRegistry}<Tools>()
    .register('search_knowledgebase', async ({ query }) => {
      // Simulate search delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Return all three knowledge base articles
      // The LLM will select the relevant one based on the query
      return {
        articles: [
          { topic: 'shipping', content: 'Standard shipping takes 3–5 business days.' },
          { topic: 'warranty', content: 'All products include a 1-year limited warranty.' },
          { topic: 'returns', content: 'You can return items within 30 days of delivery.' }
        ]
      };
    });
  return toolRegistry;
}

function createEvalRegistry() {
  const evalRegistry = new EvalRegistry()
    .register('exact_match_json', ({ output, expectedOutput }) => {
      if (!expectedOutput) {
        return { score: 0, label: 'error', reason: 'No expected output provided', passed: false };
      }
      try {
        const ok = JSON.stringify(output) === JSON.stringify(JSON.parse(expectedOutput));
        return {
          score: ok ? 1 : 0,
          label: ok ? 'correct' : 'incorrect',
          reason: ok ? 'Exact match' : 'Mismatch',
          passed: ok
        };
      } catch (e) {
        return { score: 0, label: 'error', reason: 'Failed to parse expected output as JSON', passed: false };
      }
    });
  return evalRegistry;
}

function createClient() {
  // AgentMarkLoader automatically selects the right loading strategy:
  // - If AGENTMARK_API_KEY is set: fetches from AgentMark Cloud (CMS mode)
  // - If no API key: loads from pre-built files in dist/agentmark (static mode)
  const loader = new AgentMarkLoader();
  const modelRegistry = createModelRegistry();
  const toolRegistry = createToolRegistry();
  const evalRegistry = createEvalRegistry();
  return createAgentMarkClient<AgentMarkTypes, typeof toolRegistry>({ loader, modelRegistry, toolRegistry, evalRegistry });
}

export const client = createClient();
`;
};
