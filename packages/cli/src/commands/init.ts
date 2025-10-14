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

  const { client } = await prompts({
    name: "client",
    type: "select",
    message: "Make your IDE an AgentMark expert",
    choices: [
      { title: "Claude", value: "claude" },
      { title: "Cursor", value: "cursor" },
      { title: "VS Code", value: "vscode" },
      { title: "Windsurf", value: "windsurf" },
      { title: "Zed", value: "zed" },
      { title: "Skip", value: "skip" },
    ],
  });

  createExampleApp(provider, model, client, targetPath, apiKey);

  // Always generate agentmark.json so config is consistent
  fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });

};

export default init;