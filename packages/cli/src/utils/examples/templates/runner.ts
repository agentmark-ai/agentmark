export const getRunnerFileContent = () => `// agentmark.runner.ts
import { VercelAdapterRunner } from '@agentmark/vercel-ai-v4-adapter/runner';
import type { AgentMark } from '@agentmark/agentmark-core';
import { client } from './agentmark.config';

export const runner = new VercelAdapterRunner(client as unknown as AgentMark<any, any>);
`;
