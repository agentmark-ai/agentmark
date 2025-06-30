import * as fs from "fs-extra";
import prompts from "prompts";
import { Providers } from "../utils/providers";
import { createExampleApp } from "../utils/examples/create-example-app";

const init = async (options: { target: string }) => {
  const config: any = {
    $schema:
      "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
    version: "2.0.0",
    mdxVersion: "1.0",
    agentmarkPath: "/",
  };
  console.log("Initializing project.");

  const { folderName } = await prompts({
    name: "folderName",
    type: "text",
    message: "Where would you like to create your AgentMark app?",
    initial: "my-agentmark-app",
  });

  // Create the target folder
  const targetPath = `./${folderName}`;
  fs.ensureDirSync(targetPath);

  const { provider } = await prompts({
    name: "provider",
    type: "select",
    message: "Select a model provider you want to start with",
    choices: Object.entries(Providers).map(([key, provider]) => {
      return {
        title: provider.label,
        value: key,
      };
    }),
  });

  // Default to the first language model of the chosen provider
  const model = Providers[provider as keyof typeof Providers].languageModels[0];
  
  console.log(`Using model: ${model}`);

  config.builtInModels = [model];

  // Prompt for API key if not Ollama (which doesn't need one for local usage)
  let apiKey = "";
  if (provider !== "ollama") {
    const { providedApiKey } = await prompts({
      name: "providedApiKey",
      type: "password",
      message: `Enter your ${Providers[provider as keyof typeof Providers].label} API key (or press Enter to skip):`,
      initial: "",
    });
    apiKey = providedApiKey || "";
  }

  let deployTarget = options.target;
  if (!deployTarget) {
    const { target } = await prompts({
      name: "target",
      message:
        "Are you planning to integrate with AgentMark Cloud or just use local development?",
      type: "select",
      choices: [
        { title: "AgentMark Cloud", value: "cloud" },
        { title: "Local Development", value: "local" },
      ],
    });
    deployTarget = target;
  }

  // Prompt for AgentMark credentials if using cloud
  let agentmarkApiKey = "";
  let agentmarkAppId = "";
  let webhookPlatform = "";
  if (deployTarget === "cloud") {
    const { providedAgentmarkAppId } = await prompts({
      name: "providedAgentmarkAppId",
      type: "text",
      message: "Enter your AgentMark App ID (or press Enter to skip):",
      initial: "",
    });
    agentmarkAppId = providedAgentmarkAppId || "";
    const { providedAgentmarkApiKey } = await prompts({
      name: "providedAgentmarkApiKey",
      type: "password",
      message: "Enter your AgentMark API key (or press Enter to skip):",
      initial: "",
    });
    agentmarkApiKey = providedAgentmarkApiKey || "";

    // Ask for webhook deployment platform
    const { selectedWebhookPlatform } = await prompts({
      name: "selectedWebhookPlatform",
      type: "select",
      message: "Where would you like to deploy your webhook?",
      choices: [
        { title: "Vercel", value: "vercel" },
        { title: "Cloudflare Workers", value: "cloudflare" },
        { title: "AWS Lambda", value: "aws-lambda" },
        { title: "Azure Functions", value: "azure" },
        { title: "Google Cloud Functions", value: "google-cloud" },
        { title: "Netlify Functions", value: "netlify" },
        { title: "Local only (ngrok)", value: "local" },
      ],
    });
    webhookPlatform = selectedWebhookPlatform;
  }

  const { client } = await prompts({
    name: "client",
    type: "select",
    message: "Make your IDE an AgentMark expert",
    choices: [
      { title: "Cursor", value: "cursor" },
      { title: "Windsurf", value: "windsurf" },
      { title: "Claude", value: "claude" },
      { title: "Skip", value: "skip" },
    ],
  });

  createExampleApp(provider, model, deployTarget, client, targetPath, apiKey, agentmarkApiKey, agentmarkAppId, webhookPlatform);

  if (deployTarget === "cloud") {
    fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });
    console.log(
      "🚀 Deploy your AgentMark app: https://docs.agentmark.co/platform/getting_started/quickstart"
    );
    console.log(
      "🪝 Setup your AgentMark webhook: https://docs.agentmark.co/platform/configuration/test-webhook"
    );
  }
};

export default init;