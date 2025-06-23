import * as fs from "fs-extra";
import prompts from "prompts";
import { Providers } from "../utils/providers";
import { createExampleApp } from "../utils/examples/create-example-app";

const init = async () => {
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

  const { useCloud } = await prompts({
    name: "useCloud",
    message:
      "Are you planning to integrate with AgentMark Cloud or just use local development?",
    type: "select",
    choices: [
      { title: "AgentMark Cloud", value: "cloud" },
      { title: "Local Development", value: "local" },
    ],
  });

  // Prompt for AgentMark credentials if using cloud
  let agentmarkApiKey = "";
  let agentmarkAppId = "";
  if (useCloud === "cloud") {
    const { providedAgentmarkApiKey } = await prompts({
      name: "providedAgentmarkApiKey",
      type: "password",
      message: "Enter your AgentMark API key (or press Enter to skip):",
      initial: "",
    });
    agentmarkApiKey = providedAgentmarkApiKey || "";

    const { providedAgentmarkAppId } = await prompts({
      name: "providedAgentmarkAppId",
      type: "text",
      message: "Enter your AgentMark App ID (or press Enter to skip):",
      initial: "",
    });
    agentmarkAppId = providedAgentmarkAppId || "";
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

  createExampleApp(provider, model, useCloud, client, targetPath, apiKey, agentmarkApiKey, agentmarkAppId);

  if (useCloud === "cloud") {
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