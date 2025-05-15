import 'dotenv/config';
import { VercelAIAdapter, VercelAIModelRegistry, VercelAIToolRegistry } from "@agentmark/vercel-ai-v4-adapter";
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import PuzzletTypes, { Tools } from './puzzlet1.types';
import { FileLoader, createAgentMark } from '../../packages/agentmark-core/dist';

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader('./fixtures');
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});

const tools = new VercelAIToolRegistry<Tools>()
  .register('weather', ({ location }) => ({ tempC: 22 }));

const adapter = new VercelAIAdapter<PuzzletTypes, typeof tools>(modelRegistry, tools);
const agentMark = createAgentMark({
  loader,
  adapter,
});

async function run () {
  const prompt = await agentMark.loadTextPrompt('test/math2.prompt.mdx');
  const props = {
    userMessage: "Whats 2 + 3?"
  };

  const vercelInput = await prompt.format({props});
  const result = await generateText(vercelInput);
  result.toolResults?.forEach((toolResult) => {
    console.log(toolResult);
    if (toolResult.toolName === 'weather') {
      console.log(toolResult.result.tempC);
    }
  });
  console.log(result.text);
}

run();