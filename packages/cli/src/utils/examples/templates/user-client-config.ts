export const getClientConfigContent = (options: { defaultRootDir: string; provider: string; languageModels: string[] }) => {
  const { defaultRootDir, provider, languageModels } = options;
  const providerImport = provider === 'ollama'
    ? "import { ollama } from 'ollama-ai-provider';"
    : `import { ${provider} } from '@ai-sdk/${provider}';`;
  const extraModelRegs = provider === 'openai'
    ? `.registerModels(["dall-e-3"], (name: string) => ${provider}.image(name))
    .registerModels(["tts-1-hd"], (name: string) => ${provider}.speech(name))`
    : '';
  return `// agentmark.config.ts
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
      const ok = JSON.stringify(output) === JSON.stringify(JSON.parse(expectedOutput!));
      return { score: ok ? 1 : 0, label: ok ? 'correct' : 'incorrect', reason: ok ? 'Exact match' : 'Mismatch' };
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
