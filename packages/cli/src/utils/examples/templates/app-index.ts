export const getIndexFileContent = (modelProvider: string, modelName: string, target: string = 'cloud'): string => {
  if (target === 'cloud') {
    return `import "dotenv/config";
import { AgentMarkSDK } from "@agentmark/sdk";
import { generateObject, generateText } from "ai";
import {
  VercelAIModelRegistry,
  createAgentMarkClient,
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "@ai-sdk/${modelProvider}";
import AgentMarkTypes from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['${modelName}'], (name: string) => {
  return ${modelProvider}(name);
});

const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
});

sdk.initTracing({ disableBatch: true });

const agentMarkLoader = sdk.getFileLoader();

const agentmark = createAgentMarkClient<AgentMarkTypes>({
  loader: agentMarkLoader,
  modelRegistry
});

const traceId = crypto.randomUUID();
const traceName = "customer-support";

const telemetry = {
  isEnabled: true,
  metadata: {
    traceId,
    traceName,
  },
};

const runPrompt = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt("customer-reply.prompt.mdx");
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
    telemetry,
  });

  const resp = await generateText(vercelInput);

  return resp.text;
};

const runEvaluation = async (assistant: string, customer_message: string) => {
  const prompt = await agentmark.loadObjectPrompt(
    "response-quality-eval.prompt.mdx"
  );

  const vercelInput = await prompt.format({
    props: {
      model_output: assistant,
      customer_message: customer_message,
    }
  });

  const resp = await generateObject(vercelInput);

  return resp.object;
};

const main = async () => {
  try {
    const user_message = "I'm having trouble with my order";
    const assistant = await runPrompt(user_message);
    const evaluation = await runEvaluation(assistant, user_message);

  sdk.score({
    resourceId: traceId,
    name: "response-quality",
    label: evaluation.label,
      reason: evaluation.reason,
      score: evaluation.score,
    });
  } catch (error) {
    console.error(error);
  }
};

main();
`;
  } else {
    return `import "dotenv/config";
import { FileLoader } from "@agentmark/agentmark-core";
import { generateObject, generateText } from "ai";
import {
  VercelAIModelRegistry,
  createAgentMarkClient
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "@ai-sdk/${modelProvider}";
import AgentMarkTypes from "./agentmark.types";

const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(['${modelName}'], (name: string) => {
  return ${modelProvider}(name);
});

const loader = new FileLoader('./agentmark');

const agentmark = createAgentMarkClient<AgentMarkTypes>({
  loader,
  modelRegistry,
});

// Function to run the customer reply prompt
const runPrompt = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt('customer-reply.prompt.mdx');
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
  });

  const result = await generateText(vercelInput);
  return result.text;
};

// Function to run the evaluation prompt
const runEvaluation = async (assistant: string, customer_message: string) => {
  const prompt = await agentmark.loadObjectPrompt('response-quality-eval.prompt.mdx');
  const vercelInput = await prompt.format({
    props: {
      model_output: assistant,
      customer_message: customer_message,
    },
  });

  const result = await generateObject(vercelInput);
  return result.object;
};

// Main function to execute the example
const main = async () => {
  try {
    const user_message = "I'm having trouble with my order";
    const assistant = await runPrompt(user_message);
    console.log("Assistant response:", assistant);
    const evaluation = await runEvaluation(assistant, user_message);
    console.log("Evaluation result:", evaluation);
  } catch (error) {
    console.error(error);
  }
};

main();
`;
  }
}; 