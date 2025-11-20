import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
} from "@agentmark/ai-sdk-v5-adapter";
import { openai } from "@ai-sdk/openai";
import { generateObject, streamObject } from "ai";
import { FileLoader } from "@agentmark/prompt-core";
import AgentmarkTypes from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(["gpt-4o-mini"], (name: string) => {
  return openai(name) as any;
});

const agentMark = createAgentMarkClient<AgentmarkTypes>({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
});

async function runObjectExample() {
  try {
    console.log("🚀 Testing Object Prompt with AI SDK v5\n");

    const prompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    
    // Test non-streaming
    console.log("📦 Non-streaming object generation:");
    const input = await prompt.format({
      props: {
        userMessage: "What is 15 + 27?",
      },
    });
    
    const result = await generateObject(input);
    console.log("Response:", result.object.answer2);
    console.log("Usage:", result.usage);
    console.log("");

    // Test streaming
    console.log("🌊 Streaming object generation:");
    const streamInput = await prompt.format({
      props: {
        userMessage: "What is 100 - 42?",
      },
    });
    
    const { partialObjectStream, fullStream, usage } = streamObject(streamInput);
    console.log("Streaming response:");
    for await (const chunk of partialObjectStream) {
      console.log("Object chunk:", chunk);
    }
    console.log("");
    
    // Also demonstrate fullStream for more detailed chunks
    console.log("Full stream chunks:");
    for await (const chunk of fullStream) {
      if (chunk.type === "object") {
        console.log("Object:", chunk.object);
      }
    }
    const usageData = await usage;
    console.log("Usage:", usageData);
    console.log("");
    
    console.log("✅ Object example completed!");
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

runObjectExample();

