
import { AgentMark } from '@agentmark/prompt-core';
import { VercelAIAdapter, VercelAIModelRegistry } from '@agentmark/vercel-ai-v4-adapter';
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY || 'test-key' });
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['gpt-4o'], (name: string) => openai(name));

const adapter = new VercelAIAdapter(modelRegistry);
export const client = new AgentMark({ prompt: {}, adapter });
