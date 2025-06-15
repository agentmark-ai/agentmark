import "dotenv/config";
import {
  createAgentMarkClient,
  VercelAIModelRegistry,
  VercelAIToolRegistry,
} from "@agentmark/vercel-ai-v4-adapter";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { FileLoader } from "@agentmark/agentmark-core"; // Correct import
import AgentmarkTypes, { Tools } from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
const loader = new FileLoader("./packages/agentmark-core/test"); // Instantiated FileLoader

modelRegistry.registerModels(["gpt-4o", "gpt-4o-mini"], (name: string) => {
  return openai(name);
});

const tools = new VercelAIToolRegistry<Tools>().register(
  "weather",
  ({ location }) => ({ tempC: 22 })
);

const agentMark = createAgentMarkClient({
  loader, // Passed to client, but we'll call loadDataset directly on our instance for this test
  modelRegistry,
  toolRegistry: tools,
});

async function testLoadDataset() {
  console.log("Testing FileLoader.loadDataset()...");
  try {
    const datasetStream = loader.loadDataset("sample.dataset.jsonl");
    let count = 0;

    // This loop automatically:
    // 1. Gets a reader from the stream.
    // 2. Calls reader.read() in a loop.
    // 3. Checks for `done: true` and breaks the loop.
    // 4. Assigns the `value` to the `entry` variable.
    // 5. Releases the lock on the reader when the loop finishes or if an error occurs.
    for await (const entry of datasetStream) {
      console.log(`Entry ${++count}:`, entry);
    }

    console.log("Finished reading dataset stream.");
  } catch (error) {
    console.error("Error loading or processing dataset:", error);
  }
}

async function testFormatWithDatasetStream() {
  console.log("\nTesting prompt.formatWithDatasetStream()...");
  try {
    const datasetStream = loader.loadDataset("math_ops.dataset.jsonl");

    const prompt = await agentMark.loadObjectPrompt("math2.prompt.mdx");
    const formattedOutputSteam = prompt.formatWithDatasetStream(datasetStream);

    let count = 0;
    for await (const formattedPrompt of formattedOutputSteam) {
      console.log(
        `Formatted Prompt from Dataset Entry ${++count}:`,
        JSON.stringify(formattedPrompt, null, 2)
      );
    }
    console.log("Finished processing dataset stream with prompt.");
  } catch (error) {
    console.error("Error in testFormatWithDatasetStream:", error);
  }
}

async function testFormatWithTestSettings() {
  console.log("\nTesting prompt.formatWithTestSettings()...");
  try {
    // const datasetStream = loader.loadDataset("math_ops.dataset.jsonl");

    const prompt = await agentMark.loadObjectPrompt(
      "fixtures/mathDataset.prompt.mdx"
    );
    const formattedOutputSteam = prompt.formatWithTestSettings({});

    let count = 0;
    console.log("Formatted Output Stream:", formattedOutputSteam);
    console.log("Finished processing dataset stream with prompt.");
  } catch (error) {
    console.error("Error in testFormatWithDatasetStream:", error);
  }
}

async function run() {
  const prompt = await agentMark.loadObjectPrompt("test/math2.prompt.mdx");
  const props = {
    userMessage: "Whats 2 + 3?",
  };

  const vercelInput = await prompt.format({ props });
  const result = await generateObject(vercelInput);
  console.log(result.object.answer);
}

// run();
// testLoadDataset();

testFormatWithTestSettings();
