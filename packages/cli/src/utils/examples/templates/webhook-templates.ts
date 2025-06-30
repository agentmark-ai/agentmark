export const getVercelWebhookTemplate = () => `import { NextRequest, NextResponse } from "next/server";
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
// Use the appropriate helper for your chosen framework
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

// 2. Create the webhook endpoint
export async function POST(request: NextRequest) {
  const payload = await request.json();
  const headers = request.headers;
  const xAgentmarkSign = headers.get("x-agentmark-signature-256");
  agentmarkCloudSDK.initTracing({ disableBatch: true });

  try {
    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign,
        JSON.stringify(payload)
    ))) {
      throw new Error("Invalid signature");
    }

    const event = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (event.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(event.data);
      if (response.type === "stream") {
        return new Response(response.stream, {
          headers: { ...response.streamHeader },
        });
      }
      return NextResponse.json(response);
    }

    if (event.type === "dataset-run") {
      const response = await webhookHelper.runDataset(event.data);
      return new Response(response.stream, {
        headers: {
          ...response.streamHeaders,
        },
      });
    }
    
    if (event.type === "alert") {
        // Alerts are not handled by the helper, process these manually
        console.log("Alert received:", event.data);
        return NextResponse.json({ message: "alert processed" });
    }

    throw new Error(\`Unknown event type: \\${event.type}\`);
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}`;

export const getCloudflareWebhookTemplate = () => `import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

export interface Env {
  AGENTMARK_WEBHOOK_SECRET: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    try {
      const payload = await request.json();
      const xAgentmarkSign = request.headers.get("x-agentmark-signature-256");
      agentmarkCloudSDK.initTracing({ disableBatch: true });

      // Verify signature
      if (!xAgentmarkSign || !(await verifySignature(
          env.AGENTMARK_WEBHOOK_SECRET,
          xAgentmarkSign,
          JSON.stringify(payload)
      ))) {
        throw new Error("Invalid signature");
      }

      const event = payload.event;
      const webhookHelper = new WebhookHelper(agentmarkClient);

      if (event.type === "prompt-run") {
        const response = await webhookHelper.runPrompt(event.data);
        if (response.type === "stream") {
          return new Response(response.stream, {
            headers: { ...response.streamHeader },
          });
        }
        return new Response(JSON.stringify(response), {
          headers: { "Content-Type": "application/json" },
        });
      }

      if (event.type === "dataset-run") {
        const response = await webhookHelper.runDataset(event.data);
        return new Response(response.stream, {
          headers: {
            ...response.streamHeaders,
          },
        });
      }
      
      if (event.type === "alert") {
          console.log("Alert received:", event.data);
          return new Response(JSON.stringify({ message: "alert processed" }), {
            headers: { "Content-Type": "application/json" },
          });
      }

      throw new Error(\`Unknown event type: \\${event.type}\`);
    } catch (error) {
      console.error("Webhook error:", error);
      return new Response(
        JSON.stringify({ message: "Internal server error" }),
        { 
          status: 500,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },
};`;

export const getAWSLambdaWebhookTemplate = () => `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const xAgentmarkSign = event.headers["x-agentmark-signature-256"];
    agentmarkCloudSDK.initTracing({ disableBatch: true });

    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign,
        event.body!
    ))) {
      throw new Error("Invalid signature");
    }

    const webhookEvent = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (webhookEvent.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(webhookEvent.data);
      if (response.type === "stream") {
        // For Lambda, we need to handle streaming differently
        // Convert stream to string for simple response
        const reader = response.stream.getReader();
        let result = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += new TextDecoder().decode(value);
        }
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "text/plain",
            ...response.streamHeader,
          },
          body: result,
        };
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
      };
    }

    if (webhookEvent.type === "dataset-run") {
      const response = await webhookHelper.runDataset(webhookEvent.data);
      // Convert stream to string for Lambda response
      const reader = response.stream.getReader();
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/plain",
          ...response.streamHeaders,
        },
        body: result,
      };
    }
    
    if (webhookEvent.type === "alert") {
        console.log("Alert received:", webhookEvent.data);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: "alert processed" }),
        };
    }

    throw new Error(\`Unknown event type: \\${webhookEvent.type}\`);
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};`;

export const getAzureFunctionWebhookTemplate = () => `import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

const httpTrigger: AzureFunction = async function (
  context: Context,
  req: HttpRequest
): Promise<void> {
  if (req.method !== "POST") {
    context.res = {
      status: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: { message: "Method not allowed" },
    };
    return;
  }

  try {
    const payload = req.body;
    const xAgentmarkSign = req.headers["x-agentmark-signature-256"];
    agentmarkCloudSDK.initTracing({ disableBatch: true });

    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign,
        JSON.stringify(payload)
    ))) {
      throw new Error("Invalid signature");
    }

    const event = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (event.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(event.data);
      if (response.type === "stream") {
        // Convert stream to string for Azure Functions
        const reader = response.stream.getReader();
        let result = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += new TextDecoder().decode(value);
        }
        context.res = {
          status: 200,
          headers: {
            "Content-Type": "text/plain",
            ...response.streamHeader,
          },
          body: result,
        };
        return;
      }
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: response,
      };
      return;
    }

    if (event.type === "dataset-run") {
      const response = await webhookHelper.runDataset(event.data);
      // Convert stream to string for Azure Functions
      const reader = response.stream.getReader();
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
      }
      context.res = {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          ...response.streamHeaders,
        },
        body: result,
      };
      return;
    }
    
    if (event.type === "alert") {
        context.log("Alert received:", event.data);
        context.res = {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
          body: { message: "alert processed" },
        };
        return;
    }

    throw new Error(\`Unknown event type: \\${event.type}\`);
  } catch (error) {
    context.log.error("Webhook error:", error);
    context.res = {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: { message: "Internal server error" },
    };
  }
};

export default httpTrigger;`;

export const getGoogleCloudWebhookTemplate = () => `import { HttpFunction } from '@google-cloud/functions-framework';
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

export const agentmarkWebhook: HttpFunction = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  try {
    const payload = req.body;
    const xAgentmarkSign = req.headers["x-agentmark-signature-256"];
    agentmarkCloudSDK.initTracing({ disableBatch: true });

    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign as string,
        JSON.stringify(payload)
    ))) {
      throw new Error("Invalid signature");
    }

    const event = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (event.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(event.data);
      if (response.type === "stream") {
        // Set headers for streaming
        res.set(response.streamHeader);
        response.stream.pipeTo(new WritableStream({
          write(chunk) {
            res.write(new TextDecoder().decode(chunk));
          },
          close() {
            res.end();
          }
        }));
        return;
      }
      res.json(response);
      return;
    }

    if (event.type === "dataset-run") {
      const response = await webhookHelper.runDataset(event.data);
      res.set(response.streamHeaders);
      response.stream.pipeTo(new WritableStream({
        write(chunk) {
          res.write(new TextDecoder().decode(chunk));
        },
        close() {
          res.end();
        }
      }));
      return;
    }
    
    if (event.type === "alert") {
        console.log("Alert received:", event.data);
        res.json({ message: "alert processed" });
        return;
    }

    throw new Error(\`Unknown event type: \\${event.type}\`);
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};`;

export const getNetlifyWebhookTemplate = () => `import { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

export const handler: Handler = async (
  event: HandlerEvent,
  context: HandlerContext
) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Method not allowed" }),
    };
  }

  try {
    const payload = JSON.parse(event.body || "{}");
    const xAgentmarkSign = event.headers["x-agentmark-signature-256"];
    agentmarkCloudSDK.initTracing({ disableBatch: true });

    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign,
        event.body!
    ))) {
      throw new Error("Invalid signature");
    }

    const webhookEvent = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (webhookEvent.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(webhookEvent.data);
      if (response.type === "stream") {
        // Convert stream to string for Netlify Functions
        const reader = response.stream.getReader();
        let result = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          result += new TextDecoder().decode(value);
        }
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "text/plain",
            ...response.streamHeader,
          },
          body: result,
        };
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(response),
      };
    }

    if (webhookEvent.type === "dataset-run") {
      const response = await webhookHelper.runDataset(webhookEvent.data);
      // Convert stream to string for Netlify Functions
      const reader = response.stream.getReader();
      let result = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        result += new TextDecoder().decode(value);
      }
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "text/plain",
          ...response.streamHeaders,
        },
        body: result,
      };
    }
    
    if (webhookEvent.type === "alert") {
        console.log("Alert received:", webhookEvent.data);
        return {
          statusCode: 200,
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ message: "alert processed" }),
        };
    }

    throw new Error(\`Unknown event type: \\${webhookEvent.type}\`);
  } catch (error) {
    console.error("Webhook error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: "Internal server error" }),
    };
  }
};`;

export const getLocalNgrokWebhookTemplate = () => `import express from "express";
import { AgentMarkSDK } from "@agentmark/sdk";
import { verifySignature } from "@agentmark/shared-utils";
import { agentmarkClient, agentmarkCloudSDK } from "./agentmark";
import { WebhookHelper } from "@agentmark/vercel-ai-v4-webhook-helper";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post("/webhook", async (req, res) => {
  try {
    const payload = req.body;
    const xAgentmarkSign = req.headers["x-agentmark-signature-256"];
    agentmarkCloudSDK.initTracing({ disableBatch: true });

    // Verify signature
    if (!xAgentmarkSign || !(await verifySignature(
        process.env.AGENTMARK_WEBHOOK_SECRET!,
        xAgentmarkSign as string,
        JSON.stringify(payload)
    ))) {
      throw new Error("Invalid signature");
    }

    const event = payload.event;
    const webhookHelper = new WebhookHelper(agentmarkClient);

    if (event.type === "prompt-run") {
      const response = await webhookHelper.runPrompt(event.data);
      if (response.type === "stream") {
        res.setHeader("Content-Type", "text/plain");
        Object.entries(response.streamHeader).forEach(([key, value]) => {
          res.setHeader(key, value);
        });
        
        const reader = response.stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(new TextDecoder().decode(value));
        }
        res.end();
        return;
      }
      res.json(response);
      return;
    }

    if (event.type === "dataset-run") {
      const response = await webhookHelper.runDataset(event.data);
      Object.entries(response.streamHeaders).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
      
      const reader = response.stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(new TextDecoder().decode(value));
      }
      res.end();
      return;
    }
    
    if (event.type === "alert") {
        console.log("Alert received:", event.data);
        res.json({ message: "alert processed" });
        return;
    }

    throw new Error(\`Unknown event type: \\${event.type}\`);
  } catch (error) {
    console.error("Webhook error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

app.listen(port, () => {
  console.log(\`AgentMark webhook server running on port \\${port}\`);
  console.log(\`Webhook endpoint: http://localhost:\\${port}/webhook\`);
  console.log("To expose this locally with ngrok, run: npx ngrok http " + port);
});`;

export const getAgentmarkConfigTemplate = () => `import { AgentMark } from "@agentmark/agentmark-core";
import { createAgentMarkCloudSDK } from "@agentmark/sdk";

// Initialize AgentMark client based on environment
export const agentmarkClient = new AgentMark({
  // Add your AgentMark configuration here
});

export const agentmarkCloudSDK = createAgentMarkCloudSDK({
  apiKey: process.env.AGENTMARK_API_KEY!,
  appId: process.env.AGENTMARK_APP_ID!,
});`;

export const getWebhookPackageJsonTemplate = (platform: string) => {
  const basePackageJson = {
    name: "agentmark-webhook-client",
    version: "1.0.0",
    description: `AgentMark webhook client for ${platform}`,
    scripts: {
      dev: "npm run start",
      start: "",
      build: "",
    },
    dependencies: {
      "@agentmark/sdk": "latest",
      "@agentmark/vercel-ai-v4-webhook-helper": "latest",
      "@agentmark/shared-utils": "latest",
    },
    devDependencies: {
      "typescript": "^5.0.0",
      "@types/node": "^20.0.0",
    },
  };

  switch (platform) {
    case "vercel":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "next dev",
          start: "next start",
          build: "next build",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "next": "^14.0.0",
          "react": "^18.0.0",
          "react-dom": "^18.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
          "@types/react": "^18.0.0",
          "@types/react-dom": "^18.0.0",
        },
      };
    case "cloudflare":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "wrangler dev",
          start: "wrangler deploy",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "@cloudflare/workers-types": "^4.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
          "wrangler": "^3.0.0",
        },
      };
    case "aws-lambda":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "sam local start-api",
          start: "sam deploy",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
          "@types/aws-lambda": "^8.10.0",
        },
      };
    case "azure":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "func start",
          start: "func azure functionapp publish <function-app-name>",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "@azure/functions": "^4.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
        },
      };
    case "google-cloud":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "functions-framework --target=agentmarkWebhook",
          start: "gcloud functions deploy agentmarkWebhook --runtime nodejs20 --trigger-http",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "@google-cloud/functions-framework": "^3.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
        },
      };
    case "netlify":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "netlify dev",
          start: "netlify deploy --prod",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "@netlify/functions": "^2.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
          "netlify-cli": "^17.0.0",
        },
      };
    case "local":
      return {
        ...basePackageJson,
        scripts: {
          ...basePackageJson.scripts,
          dev: "ts-node src/webhook.ts",
          start: "node dist/webhook.js",
          build: "tsc",
        },
        dependencies: {
          ...basePackageJson.dependencies,
          "express": "^4.18.0",
          "ngrok": "^5.0.0",
        },
        devDependencies: {
          ...basePackageJson.devDependencies,
          "@types/express": "^4.17.0",
          "ts-node": "^10.9.0",
        },
      };
    default:
      return basePackageJson;
  }
};