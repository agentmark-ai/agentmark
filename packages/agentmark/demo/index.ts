import 'dotenv/config';
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark } from "../src";
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import PuzzletTypes from './puzzlet1.types';

const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel(['gpt-4o', 'gpt-4o-mini'], (name: string, options: any) => {
  return openai(name);
});

const loader = new FileLoader('./puzzlet/templates');
const adapter = new VercelAdapter(modelRegistry);
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
  const result2 = await generateObject(vercelInput);
  return result2.object.answer;
}

run().then((result) => console.log(result)).catch(console.error);