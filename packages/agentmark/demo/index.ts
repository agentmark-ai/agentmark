import 'dotenv/config';
import { VercelAdapter, VercelModelRegistry, FileLoader, createAgentMark, TemplateDXTemplateEngine } from "../src";
import { experimental_generateImage as generateImage, generateObject, generateText, streamText } from 'ai';
import { createOpenAI, openai } from '@ai-sdk/openai';
import PuzzletTypes from './puzzlet1.types';
import { getFrontMatter, load } from '@puzzlet/templatedx';
import { AdaptOptions } from '../src/types';

const modelRegistry = new VercelModelRegistry();
//@ts-ignore
modelRegistry.registerModel(['gpt-4o', 'gpt-4o-mini'], (name: string, options: any) => {
  const provider = createOpenAI(options);
  return provider(name); // ⬅️ this returns the LanguageModel with doGenerate
}, 'openai');
modelRegistry.registerModel('dall-e-3', (name: string) => {
  return openai.image(name);
}, 'openai');

const loader = new FileLoader('./src');

const adapter = new VercelAdapter<PuzzletTypes>(modelRegistry);

const templateEngine = new TemplateDXTemplateEngine();

const agentMark = createAgentMark({
  // loader,
  adapter,
  templateEngine,
});


async function run() {
  const astLoad: any = await load('./test/fixtures/math.prompt.mdx');
  // const frontMatter: any = getFrontMatter(astLoad);
  // const yaml = await templateEngine.compile(astLoad);
  console.log('yaml', astLoad);
  const prompt = await agentMark.loadObjectPrompt(astLoad);
  console.log('prompt', prompt);
  // console.log('prompt', prompt);
  // const test = await loader.load('textTest.prompt.mdx');
  // const templateTest = await templateEngine.compile(test);
  // console.log('test', templateTest);
  const props = {
    userMessage: "tell me a story about nana"
  };

  console.log('hello');
  const vercelInput = await prompt.format(props, {apiKey: process.env.OPENAI_API_KEY || ''});
  console.log('vercelInput', vercelInput);
  // throw new Error('yo the format is bad');
  console.log('wassup');
  // throw new Error('yo the format is bad');

  const { object } = await generateObject(vercelInput);
  console.log('wassup 2');
  console.log('results', object);
  // for await (const textPart of textStream) {
  //   process.stdout.write(textPart);
  //   console.log('textPart', textPart);
  // }
  return object;
}

run().then((result) => console.log(result)).catch(console.error);