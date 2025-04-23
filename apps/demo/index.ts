import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import PuzzletTypes from './puzzlet1.types';
import { createAgentMark, FileLoader } from "@puzzlet/agentmark";
import { VercelAIAdapter, VercelAIModelRegistry } from "@puzzlet/vercel-ai-v4-adapter";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader('./fixtures');
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});

const adapter = new VercelAIAdapter<PuzzletTypes>(modelRegistry);
const agentMark = createAgentMark({
  loader,
  adapter,
});

async function run () {
  const prompt = await agentMark.loadObjectPrompt('test/math2.prompt.mdx');
  const props = {
    userMessage: "Whats 2 + 3?"
  };

  const vercelInput = await prompt.format(props);
  const result = await generateText(vercelInput);
  console.log(result.text);
}

run();