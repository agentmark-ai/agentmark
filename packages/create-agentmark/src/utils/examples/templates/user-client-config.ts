import { getAdapterConfig } from "./adapters.js";

export const getClientConfigContent = (options: { provider: string; languageModels: string[]; adapter: string; deploymentMode?: "cloud" | "static" }) => {
  const { provider, languageModels, adapter, deploymentMode = "cloud" } = options;
  const adapterConfig = getAdapterConfig(adapter, provider);
  const { modelRegistry, toolRegistry } = adapterConfig.classes;

  // Claude Agent SDK doesn't use @ai-sdk provider imports
  const isClaudeAgentSdk = adapter === "claude-agent-sdk";
  const providerImport = isClaudeAgentSdk ? '' : `import { ${provider} } from '@ai-sdk/${provider}';`;

  const extraModelRegs = provider === 'openai' && !isClaudeAgentSdk
    ? `.registerModels(["dall-e-3"], (name: string) => ${provider}.image(name))
    .registerModels(["tts-1-hd"], (name: string) => ${provider}.speech(name))`
    : '';

  // Import loaders from dedicated packages
  const loaderImport = deploymentMode === "cloud"
    ? `import { ApiLoader } from "@agentmark-ai/loader-api";`
    : `import { ApiLoader } from "@agentmark-ai/loader-api";
import { FileLoader } from "@agentmark-ai/loader-file";`;

  const loaderSetup = deploymentMode === "cloud"
    ? `  // ApiLoader works for both development and production
  // - Development: 'agentmark dev' sets AGENTMARK_BASE_URL to localhost
  // - Production: Set AGENTMARK_API_KEY and AGENTMARK_APP_ID for cloud
  const loader = process.env.NODE_ENV === 'development'
    ? ApiLoader.local({ baseUrl: process.env.AGENTMARK_BASE_URL || 'http://localhost:9418' })
    : ApiLoader.cloud({
        apiKey: process.env.AGENTMARK_API_KEY!,
        appId: process.env.AGENTMARK_APP_ID!,
      });`
    : `  const loader = process.env.NODE_ENV === 'development'
    ? ApiLoader.local({ baseUrl: process.env.AGENTMARK_BASE_URL || 'http://localhost:9418' })
    : new FileLoader('./dist/agentmark');`;

  // Claude Agent SDK model registry setup is different
  const modelRegistrySetup = isClaudeAgentSdk
    ? `function createModelRegistry() {
  // Claude Agent SDK accepts model names directly.
  // Use createDefault() for simple pass-through of model names.
  const modelRegistry = ${modelRegistry}.createDefault();

  // To configure specific models (e.g., extended thinking), use:
  // const modelRegistry = new ${modelRegistry}()
  //   .registerModels(/claude-.*-thinking/, (name) => ({
  //     model: name,
  //     maxThinkingTokens: 10000,  // Enable extended thinking
  //   }))
  //   .registerModels("claude-sonnet-4-20250514", (name) => ({ model: name }));

  return modelRegistry;
}`
    : `function createModelRegistry() {
  const modelRegistry = new ${modelRegistry}()
    .registerModels(${JSON.stringify(languageModels)}, (name: string) => ${provider}(name))
    ${extraModelRegs};
  return modelRegistry;
}`;

  // Claude Agent SDK adapter options
  const adapterOptionsImport = isClaudeAgentSdk
    ? `
// Claude Agent SDK adapter options
// See: https://github.com/anthropics/claude-agent-sdk
const adapterOptions = {
  // Permission mode controls tool access:
  // - 'default': Requires user approval for each tool use
  // - 'acceptEdits': Auto-approve file edits only
  // - 'bypassPermissions': Auto-approve all tools (use for automated pipelines)
  // - 'plan': Planning mode only, no tool execution
  permissionMode: 'bypassPermissions' as const,

  // Maximum conversation turns before stopping
  maxTurns: 20,

  // Optional: Set working directory for file operations
  // cwd: process.cwd(),

  // Optional: Budget limit in USD
  // maxBudgetUsd: 10.00,

  // Optional: Restrict which tools the agent can use
  // allowedTools: ['Read', 'Write', 'Glob'],
  // disallowedTools: ['Bash'],
};`
    : '';

  const createClientCall = isClaudeAgentSdk
    ? `return createAgentMarkClient<AgentMarkTypes, typeof toolRegistry>({ loader, modelRegistry, toolRegistry, evalRegistry, adapterOptions });`
    : `return createAgentMarkClient<AgentMarkTypes, typeof toolRegistry>({ loader, modelRegistry, toolRegistry, evalRegistry });`;

  return `// agentmark.client.ts
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '.env') });
import { createAgentMarkClient, ${modelRegistry}, ${toolRegistry}, EvalRegistry } from "${adapterConfig.package}";
${loaderImport}
import AgentMarkTypes, { Tools } from './agentmark.types';
${providerImport}
${adapterOptionsImport}

${modelRegistrySetup}

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
${loaderSetup}
  const modelRegistry = createModelRegistry();
  const toolRegistry = createToolRegistry();
  const evalRegistry = createEvalRegistry();
  ${createClientCall}
}

export const client = createClient();
`;
};
