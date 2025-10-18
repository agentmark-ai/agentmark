export const getClientConfigContent = (options: { provider: string; languageModels: string[] }) => {
  const { provider, languageModels } = options;
  const providerImport = provider === 'ollama'
    ? "import { ollama } from 'ollama-ai-provider';"
    : `import { ${provider} } from '@ai-sdk/${provider}';`;
  const extraModelRegs = provider === 'openai'
    ? `.registerModels(["dall-e-3"], (name: string) => ${provider}.image(name))
    .registerModels(["tts-1-hd"], (name: string) => ${provider}.speech(name))`
    : '';

  return `// agentmark.config.ts
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });
import { EvalRegistry } from "@agentmark/agentmark-core";
import { createAgentMarkClient, VercelAIModelRegistry, VercelAIToolRegistry } from "@agentmark/vercel-ai-v4-adapter";
import { AgentMarkSDK } from "@agentmark/sdk";
import AgentMarkTypes from './agentmark.types';
${providerImport}

function createModelRegistry() {
  const modelRegistry = new VercelAIModelRegistry()
    .registerModels(${JSON.stringify(languageModels)}, (name: string) => ${provider}(name))
    ${extraModelRegs};
  return modelRegistry;
}

function createToolRegistry() {
  const toolRegistry = new VercelAIToolRegistry<any>()
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

function createClient(ctx: { env?: Record<string,string|undefined> } = { env: process.env }) {
  const env = (ctx.env ?? process.env) as Record<string, string | undefined>;
  // For local development, connect to the local agentmark serve instance (default: http://localhost:9418)
  // For cloud deployment, set AGENTMARK_BASE_URL, AGENTMARK_API_KEY, and AGENTMARK_APP_ID
  const baseUrl = env.AGENTMARK_BASE_URL || 'http://localhost:9418';
  const apiKey = env.AGENTMARK_API_KEY || '';
  const appId = env.AGENTMARK_APP_ID || '';
  const sdk = new AgentMarkSDK({ apiKey, appId, baseUrl });
  const fileLoader = sdk.getFileLoader();
  const modelRegistry = createModelRegistry();
  const toolRegistry = createToolRegistry();
  const evalRegistry = createEvalRegistry();
  return createAgentMarkClient<AgentMarkTypes>({ loader: fileLoader, modelRegistry, toolRegistry, evalRegistry });
}

export const client = createClient();
`;
};
