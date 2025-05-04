import 'dotenv/config';
import { openai } from '@ai-sdk/openai';
import { generateObject, generateText, experimental_generateSpeech as generateSpeech } from 'ai';
import PuzzletTypes from './puzzlet1.types';
import { createAgentMark, FileLoader } from "@puzzlet/agentmark";
import { VercelAIAdapter, VercelAIModelRegistry } from "@puzzlet/vercel-ai-v4-adapter";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader('./packages/agentmark/test');
modelRegistry.registerModels(['gpt-4o', 'gpt-4o-mini'], (name: string) => {
  return openai(name);
});

modelRegistry.registerModels(['tts-1-hd', 'tts-1', 'gpt-4o-mini-tts'], (name: string) => (
  openai.speech(name)
));

const adapter = new VercelAIAdapter(modelRegistry);
const agentMark = createAgentMark({
  loader,
  adapter,
});

async function run () {
  const prompt = await agentMark.loadSpeechPrompt('fixtures/speech.prompt.mdx');
  const props = {
    userMessage: "Whats 2 + 3?"
  };

  const vercelInput = await prompt.format(props);
  const result = await generateSpeech(vercelInput);
  console.log(result);
  console.log(result.audio)
}

run();