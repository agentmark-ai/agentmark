import 'dotenv/config';
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark, TemplateDXTemplateEngine } from "../src";
import { experimental_generateImage as generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import PuzzletTypes from './puzzlet1.types';

const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});
modelRegistry.registerModel('dall-e-3', (name: string) => {
  return openai.image(name);
});

const loader = new FileLoader('./src');

const adapter = new VercelAdapter<PuzzletTypes>(modelRegistry);

const templateEngine = new TemplateDXTemplateEngine();

const agentMark = createAgentMark({
  loader,
  adapter,
  templateEngine,
});


async function run() {
  const prompt = await agentMark.loadImagePrompt('imageTest.prompt.mdx');
  // console.log('prompt', prompt);
  // console.log('prompt', prompt);
  const test = await loader.load('imageTest.prompt.mdx');
  const templateTest = await templateEngine.compile(test);
  console.log('test', templateTest);
  const props = {
    userMessage: "Design Whats 2 + 3?"
  };

  console.log('hello');
  const vercelInput = await prompt.format(props);
  // throw new Error('yo the format is bad');
  console.log('wassup');
  // throw new Error('yo the format is bad');
  const result2 = await generateImage(vercelInput);
  console.log('wassup 2');
  console.log('results', result2);
  return result2;
}

run().then((result) => console.log(result)).catch(console.error);