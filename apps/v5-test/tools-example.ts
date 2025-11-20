import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "@agentmark/ai-sdk-v5-adapter";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { FileLoader } from "@agentmark/prompt-core";
import AgentmarkTypes, { Tools } from "./agentmark.types";
import { z } from "zod";

const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(["gpt-4o-mini"], (name: string) => {
  return openai(name) as any;
});

const toolRegistry = new VercelAIToolRegistry<Tools>()
  .register("weather", ({ location }, toolOptions) => {
    console.log(`🌤️  Fetching weather for ${location}...`);
    console.log("Tool options:", toolOptions);
    // Simulate weather API call
    return {
      location,
      temperature: 22,
      condition: "sunny",
      humidity: 65,
    };
  })
  .register("explain", ({ topic }, toolOptions) => {
    console.log(`🔢 Explaining: ${topic}...`);
    console.log("Tool options:", toolOptions);
    // Simple calculator
    // eslint-disable-next-line no-eval
    const result = `Explaining ${topic}...`;
    return { topic, result };
  });

const agentMark = createAgentMarkClient<AgentmarkTypes, typeof toolRegistry>({
  loader: new FileLoader("./fixtures"),
  modelRegistry,
  toolRegistry,
});

async function runToolsExample() {
  try {
    console.log("🚀 Testing Tools with AI SDK v5\n");

    // Create a prompt that uses tools
    const prompt = await agentMark.loadTextPrompt("test/math2.prompt.mdx");

    const input = await prompt.format({
      props: {
        userMessage:
          "What's the weather in San Francisco and calculate 25 * 4?",
      },
      toolContext: { userId: "test-user", sessionId: "test-session" },
    });

    console.log("Input with tools:", JSON.stringify(input, null, 2));
    console.log("");

    const result = await generateText(input);
    console.log("Response:", result.text);
    console.log("Usage:", result.usage);

    if (result.steps && result.steps.length > 0) {
      console.log("\nTool calls:");
      result.steps.forEach((step, idx) => {
        if (step.toolCalls && step.toolCalls.length > 0) {
          step.toolCalls.forEach((call) => {
            if (call.toolName === "weather" && !call.dynamic) {
              console.log(
                `  ${idx + 1}. ${call.toolName}(${JSON.stringify(call.input)})`
              );
            }
            if (call.toolName === "explain" && !call.dynamic) {
              console.log(
                `  ${idx + 1}. ${call.toolName}(${JSON.stringify(call.input)})`
              );
            }
          });
        }
        if (step.toolResults && step.toolResults.length > 0) {
          step.toolResults.forEach((toolResult) => {
            if (toolResult.toolName === "weather" && !toolResult.dynamic) {
              const toolOutput = toolResult.output;
            }
            if (toolResult.toolName === "explain" && !toolResult.dynamic) {
              console.log(`     Result: ${JSON.stringify(toolResult.output)}`);
            }
          });
        }
      });
    }

    console.log("\n✅ Tools example completed!");
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("Stack:", error.stack);
    }
    process.exit(1);
  }
}

runToolsExample();
