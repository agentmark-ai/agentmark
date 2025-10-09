export const getClientConfigContent = (options: { defaultRootDir: string; provider: string; languageModels: string[]; target?: 'local' | 'cloud' }) => {
  const { defaultRootDir, provider, languageModels, target = 'local' } = options;
  const providerImport = provider === 'ollama'
    ? "import { ollama } from 'ollama-ai-provider';"
    : `import { ${provider} } from '@ai-sdk/${provider}';`;
  const extraModelRegs = provider === 'openai'
    ? `.registerModels(["dall-e-3"], (name: string) => ${provider}.image(name))
    .registerModels(["tts-1-hd"], (name: string) => ${provider}.speech(name))`
    : '';
  if (target === 'cloud') {
    return `// agentmark.config.ts (cloud)
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });
import { EvalRegistry } from "@agentmark/agentmark-core";
import { createAgentMarkClient, VercelAIModelRegistry, VercelAIToolRegistry, createRunnerServer } from "@agentmark/vercel-ai-v4-adapter";
import { AgentMarkSDK } from "@agentmark/sdk";
${providerImport}

function createModelRegistry() {
  const modelRegistry = new VercelAIModelRegistry()
    .registerModels(${JSON.stringify(languageModels)}, (name: string) => ${provider}(name))
    ${extraModelRegs};
  return modelRegistry;
}

function createToolRegistry() {
  const toolRegistry = new VercelAIToolRegistry<any>()
    .register('weather', ({ location }) => ({ tempC: 22, location }))
    .register('explain', ({ topic }) => ({ summary: 'About ' + topic }));
  return toolRegistry;
}

function createEvalRegistry() {
  const evalRegistry = new EvalRegistry()
    .register('exact_match_json', ({ output, expectedOutput }) => {
      if (!expectedOutput) {
        return { score: 0, label: 'error', reason: 'No expected output provided' };
      }
      try {
        const ok = JSON.stringify(output) === JSON.stringify(JSON.parse(expectedOutput));
        return { score: ok ? 1 : 0, label: ok ? 'correct' : 'incorrect', reason: ok ? 'Exact match' : 'Mismatch' };
      } catch (e) {
        return { score: 0, label: 'error', reason: 'Failed to parse expected output as JSON' };
      }
    });
  return evalRegistry;
}

export function createClient(ctx: { env?: Record<string,string|undefined> } = { env: process.env }) {
  const env = (ctx.env ?? process.env) as Record<string, string | undefined>;
  const apiKey = env.AGENTMARK_API_KEY!;
  const appId = env.AGENTMARK_APP_ID!;
  const baseUrl = env.AGENTMARK_BASE_URL || 'http://localhost:9418';
  const sdk = new AgentMarkSDK({ apiKey, appId, baseUrl });
  const fileLoader = sdk.getFileLoader();
  const modelRegistry = createModelRegistry();
  const toolRegistry = createToolRegistry();
  const evalRegistry = createEvalRegistry();
  return createAgentMarkClient({ loader: fileLoader, modelRegistry, toolRegistry, evalRegistry });
}

export const client = createClient();

// Start runner server when executed directly
if (require.main === module) {
  createRunnerServer({ client, port: 9417 }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
`;
  }
  // local default
  return `// agentmark.config.ts (local)
import { FileLoader, EvalRegistry } from "@agentmark/agentmark-core";
import { createAgentMarkClient, VercelAIModelRegistry, VercelAIToolRegistry } from "@agentmark/vercel-ai-v4-adapter";
${providerImport}

function createModelRegistry() {
  const modelRegistry = new VercelAIModelRegistry()
    .registerModels(${JSON.stringify(languageModels)}, (name: string) => ${provider}(name))
    ${extraModelRegs};
  return modelRegistry;
}

function createToolRegistry() {
  const toolRegistry = new VercelAIToolRegistry<any>()
    .register('weather', ({ location }) => ({ tempC: 22, location }))
    .register('explain', ({ topic }) => ({ summary: 'About ' + topic }));
  return toolRegistry;
}

function createEvalRegistry() {
  const evalRegistry = new EvalRegistry()
    .register('exact_match_json', ({ output, expectedOutput }) => {
      if (!expectedOutput) {
        return { score: 0, label: 'error', reason: 'No expected output provided' };
      }
      try {
        const ok = JSON.stringify(output) === JSON.stringify(JSON.parse(expectedOutput));
        return { score: ok ? 1 : 0, label: ok ? 'correct' : 'incorrect', reason: ok ? 'Exact match' : 'Mismatch' };
      } catch (e) {
        return { score: 0, label: 'error', reason: 'Failed to parse expected output as JSON' };
      }
    });
  return evalRegistry;
}

export function createClient(ctx: { env?: Record<string,string|undefined>, rootDir?: string } = { env: process.env }) {
  const rootDir = ctx.rootDir || (ctx.env ?? process.env).AGENTMARK_ROOT || '${defaultRootDir}';
  const loader = new FileLoader(rootDir);
  const modelRegistry = createModelRegistry();
  const toolRegistry = createToolRegistry();
  const evalRegistry = createEvalRegistry();
  return createAgentMarkClient({ loader, modelRegistry, toolRegistry, evalRegistry });
}

export const client = createClient();
`;
};
