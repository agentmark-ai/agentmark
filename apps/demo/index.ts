import 'dotenv/config';
import { VercelAIAdapter, VercelAIModelRegistry, VercelAIToolRegistry } from "@agentmark/vercel-ai-v4-adapter";
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText } from 'ai';
import PuzzletTypes, { Tools } from './puzzlet1.types';
import { FileLoader, createAgentMark } from '@agentmark/agentmark';

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader('./fixtures');
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});

const toolRegistry = new VercelAIToolRegistry<Tools>()
  .register('weather', async (args) => {
    return {
      a: 1,
      b: 2,
    };
  });


const adapter = new VercelAIAdapter<PuzzletTypes>(modelRegistry, toolRegistry);
const agentMark = createAgentMark({
  loader,
  adapter,
});

async function run () {
  const prompt = await agentMark.loadTextPrompt('test/math2.prompt.mdx');
  const props = {
    userMessage: "Whats 2 + 3?"
  };

  const vercelInput = await prompt.format(props);
  const result = await generateText(vercelInput);
  console.log(result.text);
}

run();