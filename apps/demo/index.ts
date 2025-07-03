import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "@agentmark/vercel-ai-v4-adapter";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
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
  const prompt = await agentMark.loadTextPrompt("customer-support.prompt.mdx");
  const props = {
    customer_question: "My package hasn't arrived yet. Can you help me track it?",
  };

  const vercelInput = await prompt.format({ props });
  const result = await generateText(vercelInput);
  console.log(result.text);
}

run();
