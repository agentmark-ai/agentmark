import "dotenv/config";
import { openai } from "@ai-sdk/openai";
import {
  createAgentMarkClient,
  MastraModelRegistry,
  MastraToolRegistry,
} from "@agentmark/mastra-adapter";
import { FileLoader } from "@agentmark/agentmark-core";
import { Agent } from "@mastra/core/agent";
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import AgentmarkTypes, { Tools } from "./agentmark.types";

// Create a model registry for AgentMark
const modelRegistry = new MastraModelRegistry();
modelRegistry.registerModels(
  ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
  (modelName: string) => {
    return openai(modelName);
  }
);

const explainTool = createTool({
  id: "explain",
  description: "Explain the weather",
  inputSchema: z.object({loc: z.string()}) as unknown as z.ZodType<{loc: string}>,
  outputSchema: z.object({r: z.string()}),
  execute: (args) => {
    const c = args
    return Promise.resolve({
      r: "asd"
    });
  },
});   




// Create a tool registry for AgentMark
const toolRegistry = new MastraToolRegistry<Tools>()
  .register("weather", () => {
    return {
      id: "weather",
    };
  })
  .register("explain", () => {
    return {
      id: "explain",
    };
  });

// Create the AgentMark client with Mastra adapter
const mastraAgentMark = createAgentMarkClient<AgentmarkTypes, typeof toolRegistry>({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
  toolRegistry,
});

async function runMastraExample() {
  try {
    const textPrompt = await mastraAgentMark.loadTextPrompt(
      "test/math2.prompt.mdx"
    );

    const props = {
      userMessage:
        "What's the weather like in New York? Can you also explain how weather forecasting works?",
      location: "New York",
    };

    const agentResult = await textPrompt.formatAgent({ props: {} });

    const [generatedMessages, options] = await agentResult.formatMessages({
      props,
    });

    const t = agentResult.tools;

    const weatherAgent = new Agent(agentResult);

    const response = await weatherAgent.generate(generatedMessages, options);

    console.log(response.toolResults.map((i) => {
      if(i.toolName === "weather") {
        return i.args;
      }
      if(i.toolName === "explain") {
        return i.args;
      }
      return i;
    }));
  } catch (error) {
    console.error("❌ Error in Mastra example:", error);
    console.error("Stack:", error.stack);
  }
}

// Run the example
runMastraExample();
