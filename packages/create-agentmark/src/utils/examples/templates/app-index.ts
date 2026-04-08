export const getIndexFileContent = (adapter: string = "ai-sdk", deploymentMode: "cloud" | "static" = "cloud"): string => {
  const isCloud = deploymentMode === "cloud";

  const tracingImport = `import { AgentMarkSDK } from "@agentmark-ai/sdk";
`;

  const cloudTracingInit = `
// Initialize tracing - traces will be sent to AgentMark Cloud
// To disable tracing, comment out sdk.initTracing() below
const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY ?? "",
  appId: process.env.AGENTMARK_APP_ID ?? "",
});
sdk.initTracing({ disableBatch: true });
`;

  const staticTracingInit = `
// Initialize tracing - traces will be sent to local dev server
// Make sure to run "npm run agentmark dev" in another terminal first
// To disable tracing, comment out sdk.initTracing() below
const sdk = new AgentMarkSDK({
  apiKey: "",
  appId: "",
  baseUrl: "http://localhost:9418",
});
sdk.initTracing({ disableBatch: true });
`;

  const tracingInit = isCloud ? cloudTracingInit : staticTracingInit;

  if (adapter === "claude-agent-sdk") {
    return `import "dotenv/config";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { withTracing } from "@agentmark-ai/claude-agent-sdk-adapter";
${tracingImport}import { client } from "./agentmark.client";
${tracingInit}
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
  const adapted = await prompt.format({
    props: {
      customer_question: customer_message,
    },
    telemetry,
  });

  // Execute with Claude Agent SDK using withTracing for telemetry
  // The adapted object contains { query, telemetry } ready for withTracing()
  const tracedResult = await withTracing(query, adapted);

  // traceId is available immediately
  console.log("Trace ID:", tracedResult.traceId);

  let result = "";
  for await (const message of tracedResult) {
    if (message.type === "result" && message.subtype === "success") {
      result = message.result || "";
    }
  }

  return result;
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
  } else if (adapter === "mastra") {
    return `import "dotenv/config";
import { Agent } from "@mastra/core/agent";
${tracingImport}import { client } from "./agentmark.client";
${tracingInit}
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
${tracingImport}import { client } from "./agentmark.client";
${tracingInit}
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
