import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
  McpServerRegistry,
} from "@agentmark/ai-sdk-v4-adapter";
import { openai } from "@ai-sdk/openai";
import { FileLoader } from "@agentmark/prompt-core";
import { Tools } from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader("./fixtures");
modelRegistry.registerModels(["gpt-4o", "gpt-4o-mini"], (name: string) => {
  return openai(name);
});

const tools = new VercelAIToolRegistry<Tools>().register(
  "weather",
  ({ location: _location }) => ({ tempC: 22 })
);

const mcpRegistry = new McpServerRegistry().register("test", {
  command: "npx",
  args: ["-y", "@mastra/mcp-docs-server"],
});

const agentMark = createAgentMarkClient({
  loader,
  modelRegistry,
  toolRegistry: tools,
  mcpRegistry,
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
