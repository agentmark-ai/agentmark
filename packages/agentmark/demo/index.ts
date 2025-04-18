import 'dotenv/config';
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark } from "../src";
import { openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import PuzzletTypes from './puzzlet1.types';

const modelRegistry = new VercelModelRegistry();
const loader = new FileLoader('./fixtures');
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});

const adapter = new VercelAdapter<PuzzletTypes>(modelRegistry);
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
  const result = await generateObject(vercelInput);
  console.log(result.object.answer);
}

run();