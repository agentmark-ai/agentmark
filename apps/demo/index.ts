import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "@agentmark/ai-sdk-v4-adapter";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { FileLoader } from "@agentmark/prompt-core";
import { Tools } from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader("./fixtures");
modelRegistry.registerModels(["gpt-4o", "gpt-4o-mini"], (name: string) => {
  return openai(name);
});

const tools = new VercelAIToolRegistry<Tools>().register(
  "weather",
  ({ location }) => ({ tempC: 22 })
);

const agentMark = createAgentMarkClient({
  loader,
  modelRegistry,
  toolRegistry: tools,
  mcpServers: {
    test: {
      command: "npx",
      args: ["-y", "@mastra/mcp-docs-server"],
    },
  },
});

async function run() {
  const prompt = await agentMark.loadTextPrompt("./mcp-text.prompt.mdx");
  const props = {
    userMessage: "Whats 2 + 3?",
  };

  const vercelInput = await prompt.format({ props });
  console.log(vercelInput);
  // const result = await generateObject(vercelInput);
  // console.log(result.object.answer);
}

run();
