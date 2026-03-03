import { AgentMarkSDK, trace } from "@agentmark-ai/sdk";

// Initialize the SDK
const sdk = new AgentMarkSDK({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
});

// Start OpenTelemetry tracing
sdk.initTracing();

async function handleRequest(userId: string, question: string) {
  // Create a trace for this request
  const { result, traceId } = await trace(
    {
      name: "customer-question",
      userId,
      sessionId: `session-${userId}`,
      metadata: { source: "api", question },
    },
    async (ctx) => {
      // Child span: load the prompt
      const promptData = await ctx.span({ name: "load-prompt" }, async () => {
        const loader = sdk.getApiLoader();
        return loader.load("customer-support-agent", "text");
      });

      // Child span: call the LLM (use promptData with your adapter)
      const response = await ctx.span({ name: "llm-call" }, async () => {
        // Use your adapter here (Vercel AI, Claude SDK, etc.)
        // promptData contains the formatted prompt ready for your SDK
        console.log("Loaded prompt:", typeof promptData);
        return "Example response";
      });

      // Child span: save to database
      await ctx.span({ name: "save-response" }, async () => {
        // Save response to your database
        console.log("Saved response for trace:", ctx.traceId);
      });

      return response;
    }
  );

  console.log(`Request handled. Trace ID: ${traceId}`);
  return result;
}

// Example usage
handleRequest("user-123", "How long does shipping take?");
