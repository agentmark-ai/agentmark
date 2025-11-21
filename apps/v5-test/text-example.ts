import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
} from "@agentmark/ai-sdk-v5-adapter";
import { openai } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";
import { FileLoader } from "@agentmark/prompt-core";

const modelRegistry = new VercelAIModelRegistry();

modelRegistry.registerModels(["gpt-4o-mini"], (name: string) => {
  return openai(name) as any;
});

const agentMark = createAgentMarkClient({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
});

async function runTextExample() {
  try {
    console.log("🚀 Testing Text Prompt with AI SDK v5\n");

    const prompt = await agentMark.loadTextPrompt("text.prompt.mdx");
    
    // Test non-streaming
    console.log("📝 Non-streaming text generation:");
    const input = await prompt.format({
      props: {
        userMessage: "Explain quantum computing in simple terms.",
      },
    });
    
    const result = await generateText(input);
    console.log("Response:", result.text);
    console.log("Usage:", result.usage);
    console.log("");

    // Test streaming
    console.log("🌊 Streaming text generation:");
    const streamInput = await prompt.format({
      props: {
        userMessage: "Write a haiku about programming.",
      },
    });
    
    const { textStream, fullStream } = streamText(streamInput);
    console.log("Streaming response:");
    for await (const chunk of textStream) {
      process.stdout.write(chunk);
    }
    console.log("\n");
    
    // Also demonstrate fullStream for more detailed chunks
    console.log("Full stream chunks:");
    for await (const chunk of fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
      } else if (chunk.type === "finish") {
        console.log("\nFinished. Usage:", chunk.totalUsage);
      }
    }
    console.log("\n");
    
    console.log("✅ Text example completed!");
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

runTextExample();

