export const getIndexFileContent = (modelProvider: string, modelName: string, target: string = 'cloud'): string => {
  if (target === 'cloud') {
    return `import "dotenv/config";
import { AgentMarkSDK } from "@agentmark/sdk";
import { generateText } from "ai";
import {
  VercelAIModelRegistry,
  createAgentMarkClient,
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "${modelProvider === 'ollama' ? 'ollama-ai-provider' : `@ai-sdk/${modelProvider}`}";
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

const runCustomerSupport = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt("customer-support.prompt.mdx");
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
    telemetry,
  });

  const resp = await generateText(vercelInput);

  return resp.text;
};

const main = async () => {
  try {
    const user_message = "My package hasn't arrived yet. Can you help me track it?";
    const assistant = await runCustomerSupport(user_message);
    console.log("Customer support response:", assistant);
  } catch (error) {
    console.error(error);
  }
};

main();
`;
  } else {
    return `import "dotenv/config";
import { FileLoader } from "@agentmark/agentmark-core";
import { generateText } from "ai";
import {
  VercelAIModelRegistry,
  createAgentMarkClient
} from "@agentmark/vercel-ai-v4-adapter";
import { ${modelProvider} } from "${modelProvider === 'ollama' ? 'ollama-ai-provider' : `@ai-sdk/${modelProvider}`}";
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

// Function to run the customer support prompt
const runCustomerSupport = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt('customer-support.prompt.mdx');
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
  });

  const result = await generateText(vercelInput);
  return result.text;
};

// Main function to execute the example
const main = async () => {
  try {
    const user_message = "My package hasn't arrived yet. Can you help me track it?";
    const assistant = await runCustomerSupport(user_message);
    console.log("Customer support response:", assistant);
  } catch (error) {
    console.error(error);
  }
};

main();
`;
  }
}; 