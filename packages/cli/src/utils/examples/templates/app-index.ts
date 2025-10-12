export const getIndexFileContent = (modelProvider: string, modelName: string, target: string = 'cloud'): string => {
  if (target === 'cloud') {
    return `import "dotenv/config";
import { generateText } from "ai";
import { createClient } from "./agentmark.config";
import AgentMarkTypes from "./agentmark.types";

const agentmark = createClient();

const telemetry = {
  isEnabled: true,
  metadata: {
    traceId: "trace-123",
    traceName: "customer-support",
    userId: "user-123",
    sessionId: "session-123",
    sessionName: "my-first-session",
  },
};

const runCustomerSupport = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt("customer-support-agent.prompt.mdx");
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
    telemetry,
  });

  const resp = await generateText({
    ...vercelInput,
    maxSteps: 5,  // Allow multiple rounds of tool calls
  });

  return resp.text;
};

const main = async () => {
  try {
    const user_message = "How long does shipping take?";
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
import { generateText } from "ai";
import { createClient } from "./agentmark.config";
import AgentMarkTypes from "./agentmark.types";

const agentmark = createClient();

// Function to run the customer support prompt
const runCustomerSupport = async (customer_message: string) => {
  const prompt = await agentmark.loadTextPrompt('customer-support-agent.prompt.mdx');
  const vercelInput = await prompt.format({
    props: {
      customer_question: customer_message,
    },
  });

  const result = await generateText({
    ...vercelInput,
    maxSteps: 5,  // Allow multiple rounds of tool calls
  });
  return result.text;
};

// Main function to execute the example
const main = async () => {
  try {
    const user_message = "How long does shipping take?";
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