import { config } from "dotenv";
import { gemini, GEMINI_MODEL } from "@llamaindex/google";
import { FileLoader } from "@agentmark/agentmark-core";
import { agent } from "@llamaindex/workflow";
import {
  createAgentMarkClient,
  LlamaIndexModelRegistry,
  LlamaIndexToolRegistry,
} from "@agentmark/llamaindex-adapter";
import AgentmarkTypes from "./test";

config();
const calculateTool = async (input: { expression: string }) => {
  // Note: This is a simple example and eval should not be used in production
  const result = eval(input.expression);
  return { result };
};

async function main() {
  // Step 1: Register all valid models
  const modelRegistry = new LlamaIndexModelRegistry();
  const validModels = Object.values(GEMINI_MODEL);
  modelRegistry.registerModels(validModels, (name) =>
    gemini({
      apiKey: process.env.GOOGLE_API_KEY!,
      model: name as GEMINI_MODEL,
    })
  );

  const toolRegistry = new LlamaIndexToolRegistry();
  toolRegistry.register("calculate", calculateTool);

  // Step 2: Create AgentMark client with proper typing
  const amClient = createAgentMarkClient<AgentmarkTypes>({
    loader: new FileLoader("./"),
    modelRegistry,
    toolRegistry,
  });

  const prompt = await amClient.loadTextPrompt("example.prompt.mdx");
  const agentInput = await prompt.formatAgent({
    props: {
      userType: "admin",
      num: 3,
    },
  });
  console.log("Agent Input:", agentInput);
  const userInput = await agentInput.formatGenerateText({
    props: {},
  });
  console.log("User Input:", userInput);
  const myAgent = agent(agentInput);

  const response = await myAgent.run(userInput);
  console.log("AI Response:", response.data.message);
}

main();
