import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
} from "@agentmark/ai-sdk-v5-adapter";
import { openai } from "@ai-sdk/openai";
import { generateText, generateObject } from "ai";
import { FileLoader } from "@agentmark/prompt-core";

// Create a model registry for AgentMark
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(
  ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
  (modelName: string) => {
    return openai(modelName) as any;
  }
);

// Create the AgentMark client with AI SDK v5 adapter
const agentMark = createAgentMarkClient({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
});

async function runExample() {
  try {
    console.log("🚀 Testing AI SDK v5 Adapter\n");

    // Test text prompt
    console.log("📝 Testing text prompt...");
    const textPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
    const textInput = await textPrompt.format({
      props: {
        userMessage: "What is 2 + 2?",
      },
    });
    console.log("Text prompt input:", JSON.stringify(textInput, null, 2));
    
    const textResult = await generateText(textInput);
    console.log("Text result:", textResult.text);
    console.log("Usage:", textResult.usage);
    console.log("");

    // Test object prompt
    console.log("📦 Testing object prompt...");
    const objectPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const objectInput = await objectPrompt.format({
      props: {
        userMessage: "What is 5 + 3?",
      },
    });
    console.log("Object prompt input:", JSON.stringify(objectInput, null, 2));
    
    const objectResult = await generateObject(objectInput);
    console.log("Object result:", objectResult.object);
    console.log("Usage:", objectResult.usage);
    console.log("");

    console.log("✅ All tests completed successfully!");
  } catch (error) {
    console.error("❌ Error in example:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

// Run the example
runExample();

