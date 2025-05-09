export const getIndexFileContent = (modelProvider: string, modelName: string, useCloud: string = 'cloud'): string => {
  if (useCloud === 'cloud') {
    return `import "dotenv/config";
import { Agentmark } from "@agentmark/sdk";
import { createAgentMark } from "@agentmark/agentmark";
import { generateObject, generateText } from "ai";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "@ai-sdk/${modelProvider}";
import AgentMarkTypes from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['${modelName}'], (name: string) => {
  return ${modelProvider}(name);
});

const agentmarkClient = new Agentmark({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
  baseUrl: process.env.AGENTMARK_BASE_URL!,
});

agentmarkClient.initTracing({ disableBatch: true });

const agentMarkLoader = agentmarkClient.createLoader();

const agentmark = createAgentMark({
  loader: agentMarkLoader,
  adapter: new VercelAIAdapter<AgentMarkTypes>(modelRegistry),
});

const traceId = crypto.randomUUID();
const traceName = "customer-support";

const telemetry = {
  isEnabled: true,
  traceId,
  traceName,
};

const runPrompt = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt("customer-reply.prompt.mdx");
  const vercelInput = await prompt.format({
    customer_question: customer_message,
  });

  const resp = await generateText({
    ...vercelInput,
    experimental_telemetry: telemetry,
  });

  return resp.text;
};

const runEvaluation = async (assistant: string, customer_message: string) => {
  const prompt = await agentmark.loadObjectPrompt(
    "response-quality-eval.prompt.mdx"
  );

  const vercelInput = await prompt.format({
    model_output: assistant,
    customer_message: customer_message,
  });

  const resp = await generateObject({
    ...vercelInput,
    experimental_telemetry: telemetry,
  });

  return resp.object;
};

const main = async () => {
  const user_message = "I'm having trouble with my order";
  const assistant = await runPrompt(user_message);
  const evaluation = await runEvaluation(assistant, user_message);

  agentmarkClient.score({
    resourceId: traceId,
    name: "response-quality",
    label: evaluation.label,
    reason: evaluation.reason,
    score: evaluation.score,
  });
};

main();
`;
  } else {
    return `import "dotenv/config";
import { createAgentMark, FileLoader } from "@agentmark/agentmark";
import { generateObject, generateText } from "ai";
import {
  VercelAIAdapter,
  VercelAIModelRegistry,
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "@ai-sdk/${modelProvider}";
import AgentMarkTypes from "./agentmark.types";

// Setup model registry with your selected provider and model
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['${modelName}'], (name: string) => {
  return ${modelProvider}(name);
});

// Create a local file loader pointing to your prompts directory
const loader = new FileLoader('./agentmark');

// Setup the adapter
const adapter = new VercelAIAdapter<AgentMarkTypes>(modelRegistry);

// Initialize AgentMark with local configuration
const agentmark = createAgentMark({
  loader,
  adapter,
});

// Function to run the customer reply prompt
const runPrompt = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt('customer-reply.prompt.mdx');
  const vercelInput = await prompt.format({
    customer_question: customer_message,
  });

  const result = await generateText(vercelInput);
  return result.text;
};

// Function to run the evaluation prompt
const runEvaluation = async (assistant: string, customer_message: string) => {
  const prompt = await agentmark.loadObjectPrompt('response-quality-eval.prompt.mdx');
  const vercelInput = await prompt.format({
    model_output: assistant,
    customer_message: customer_message,
  });

  const result = await generateObject(vercelInput);
  return result.object;
};

// Main function to execute the example
const main = async () => {
  const user_message = "I'm having trouble with my order";
  console.log("User message:", user_message);
  
  const assistant = await runPrompt(user_message);
  console.log("Assistant response:", assistant);
  
  const evaluation = await runEvaluation(assistant, user_message);
  console.log("Evaluation result:", evaluation);
};

main();
`;
  }
}; 