import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import {
  createAgentMarkClient,
  MastraModelRegistry,
} from "@agentmark/mastra-adapter";
import { FileLoader } from "@agentmark/agentmark-core";
import { Agent } from "@mastra/core/agent";
import AgentmarkTypes from "./agentmark.types";

// Create a model registry for AgentMark
const modelRegistry = new MastraModelRegistry();
modelRegistry.registerModels(
  ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
  (modelName: string) => {
    return openai(modelName);
  }
);

// Create the AgentMark client with Mastra adapter
const mastraAgentMark = createAgentMarkClient<AgentmarkTypes>({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
});

async function runMastraExample() {
  try {
    const textPrompt = await mastraAgentMark.loadObjectPrompt(
      "math.prompt.mdx"
    );

    const props = {
      userMessage:
        "What's the weather like in New York? Can you also explain how weather forecasting works?",
      location: "New York",
    };

    const agentResult = await textPrompt.formatAgent();

    const [generatedMessages, options] = await agentResult.formatMessages({
      props,
    });

    const t = agentResult.tools;

    const weatherAgent = new Agent(agentResult);

    const response = await weatherAgent.generate(generatedMessages, options);

    console.log(response);
  } catch (error) {
    console.error("❌ Error in Mastra example:", error);
    console.error("Stack:", error.stack);
  }
}

// Run the example
runMastraExample();
