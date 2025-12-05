export const getIndexFileContent = (adapter: string = "ai-sdk"): string => {
  if (adapter === "mastra") {
    return `import "dotenv/config";
import { Agent } from "@mastra/core/agent";
import { client } from "./agentmark.client";

const telemetry = {
  isEnabled: true,
  metadata: {
    trace_name: "customer-support",
    user_id: "user-123",
    session_id: "session-123",
    session_name: "my-first-session",
  },
};

const runCustomerSupport = async (customer_message: string) => {
  const prompt = await client.loadTextPrompt("customer-support-agent");
  const agentConfig = await prompt.formatAgent({
    options: {
      telemetry,
    },
  });

  const [messages, generateOptions] = await agentConfig.formatMessages({
    props: {
      customer_question: customer_message,
    },
  });

  const agent = new Agent(agentConfig);
  const response = await agent.generate(messages, generateOptions);

  return (response as any).text || (response as any).content || String(response);
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
import { client } from "./agentmark.client";

const telemetry = {
  isEnabled: true,
  metadata: {
    trace_name: "customer-support",
    user_id: "user-123",
    session_id: "session-123",
    session_name: "my-first-session",
  },
};

const runCustomerSupport = async (customer_message: string) => {
  const prompt = await client.loadTextPrompt("customer-support-agent");
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