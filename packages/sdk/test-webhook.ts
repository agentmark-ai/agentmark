import { AgentMarkSDK } from "./src/agentmark";
import { trace } from "./src/trace/tracing";
import * as api from "@opentelemetry/api";

async function testWebhook() {
  const sdk = new AgentMarkSDK({
    apiKey: "test-api-key",
    appId: "test-app-id",
    baseUrl: "https://webhook.site/3e977799-211c-49e1-be3f-744112b343bb",
  });

  console.log("Initializing tracing...");
  const tracer = sdk.initTracing({ disableBatch: true });

  console.log("Creating test span...");
  await trace(
    {
      name: "test-span",
      metadata: {
        sessionId: "test-session-123",
        userId: "test-user-456",
      },
    },
    async () => {
      console.log("Inside trace function");
      await new Promise((resolve) => setTimeout(resolve, 100));
      return "test-result";
    }
  );

  console.log("Flushing spans...");
  const provider = api.trace.getTracerProvider() as any;
  if (provider.forceFlush) {
    try {
      await provider.forceFlush();
      console.log("Force flush completed");
    } catch (error) {
      console.error("Error during force flush:", error);
    }
  } else {
    console.warn("Provider does not have forceFlush method");
  }

  console.log("Waiting for export (5 seconds)...");
  await new Promise((resolve) => setTimeout(resolve, 5000));

  console.log("Test complete! Check your webhook.site page for the request.");
  console.log("URL: https://webhook.site/3e977799-211c-49e1-be3f-744112b343bb");
  
  await tracer.shutdown();
  process.exit(0);
}

testWebhook().catch(console.error);

