import 'dotenv/config';
import { DefaultAdapter, FileLoader, createAgentMark } from "../src";
import PuzzletTypes from './puzzlet1.types';

const loader = new FileLoader('./fixtures');
const adapter = new DefaultAdapter();
const agentMark = createAgentMark<PuzzletTypes>({
  loader,
  adapter,
});

async function run () {
  const prompt = await agentMark.loadObjectPrompt('test/math2.prompt.mdx');
  const props = {
    userMessage: "Whats 2 + 3?"
  };

  const vercelInput = await prompt.format(props);
  console.log(vercelInput);
}

run();