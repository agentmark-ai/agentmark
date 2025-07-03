import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "@agentmark/vercel-ai-v4-adapter";
import { openai } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { FileLoader } from "@agentmark/agentmark-core";
import AgentmarkTypes, { Tools } from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader("./fixtures");
modelRegistry.registerModels(["gpt-4o", "gpt-4o-mini"], (name: string) => {
  return openai(name);
});

const tools = new VercelAIToolRegistry<Tools>().register(
  "weather",
  ({ location }) => ({ tempC: 22 })
);

const agentMark = createAgentMarkClient<AgentmarkTypes>({
  loader,
  modelRegistry,
  toolRegistry: tools,
});

async function run() {
  const prompt = await agentMark.loadObjectPrompt("test/math2.prompt.mdx");
  const props = {
    userMessage: "Whats 2 + 3?",
  };

  const vercelInput = await prompt.format({ props });
  const result = await generateObject(vercelInput);
  console.log(result.object.answer);
}

run();
