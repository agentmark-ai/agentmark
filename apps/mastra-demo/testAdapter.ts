import {
  MastraModelRegistry,
  MastraToolRegistry,
  createAgentMarkClient,
} from "@agentmark/mastra-adapter";
import { google } from "@ai-sdk/google";
import { FileLoader } from "@agentmark/agentmark-core";
import { config } from "dotenv";
import AgentmarkTypes from "./test";
import { Agent } from "@mastra/core";

config();

const modelRegistry = new MastraModelRegistry();
modelRegistry.registerModels("gemini-1.5-flash", () =>
  google("gemini-1.5-flash")
);

const toolRegistry = new MastraToolRegistry();

toolRegistry.register("echo", {
  execute: async (executionContext) => {
    console.log("Echo tool executed with:", executionContext);
    const message =
      executionContext.context?.message || executionContext.message;
    return `Echo: ${message}`;
  },
});

async function testAdapter() {
  const client = createAgentMarkClient<AgentmarkTypes>({
    modelRegistry,
    toolRegistry,
    loader: new FileLoader("./"),
  });
  const prompt = await client.loadTextPrompt("example.prompt.mdx");
  const executionOptions = {
    maxSteps: 2,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "test-function",
      metadata: { testRun: "formatMessage-execution" },
    },
    toolContext: {
      environment: "development",
      userId: "test-user",
    },
  };

  const agentInput = await prompt.formatAgent({
    props: { userType: "admin", num: 3 },
  });
  console.log("Agent Input is: ", agentInput);
  const agent = new Agent(agentInput);
  const messages = await agentInput.formatMessage({
    props: {},
  });

  console.log("Messages:", messages);

  const response = await agent.generate(messages, {
    telemetry: executionOptions.experimental_telemetry,
    maxSteps: 5,
  });
  console.log("Response text:", response.text);
}

testAdapter().catch(console.error);
