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
    agentmarkPath: ".",
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

  // Force OpenAI provider for initial setup to streamline onboarding
  const provider = 'openai';

  // Default to the first language model of the chosen provider
  const model = Providers[provider as keyof typeof Providers].languageModels[0];
  
  // Model is selected implicitly for setup; no need to log

  config.builtInModels = [model];

  // Prompt only for the OpenAI API key
  let apiKey = "";
  const { providedApiKey } = await prompts({
    name: "providedApiKey",
    type: "password",
    message: `Enter your OpenAI API key (or press Enter to skip):`,
    initial: "",
  });
  apiKey = providedApiKey || "";

  // Always force cloud deployment
  const deployTarget = "cloud";

  // Prompt for AgentMark credentials
  const { providedAgentmarkAppId } = await prompts({
    name: "providedAgentmarkAppId",
    type: "text",
    message: "Enter your AgentMark App ID (or press Enter to skip):",
    initial: "",
  });
  const agentmarkAppId = providedAgentmarkAppId || "";

  const { providedAgentmarkApiKey } = await prompts({
    name: "providedAgentmarkApiKey",
    type: "password",
    message: "Enter your AgentMark API key (or press Enter to skip):",
    initial: "",
  });
  const agentmarkApiKey = providedAgentmarkApiKey || "";

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

  createExampleApp(provider, model, deployTarget, client, targetPath, apiKey, agentmarkApiKey, agentmarkAppId);

  // Always generate agentmark.json so config is consistent
  fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });
  console.log(
    "🚀 Deploy your AgentMark app: https://docs.agentmark.co/platform/getting_started/quickstart"
  );
  console.log(
    "🪝 Setup your AgentMark webhook: https://docs.agentmark.co/platform/configuration/test-webhook"
  );

};

export default init;