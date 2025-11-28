import fs from "fs-extra";
import prompts from "prompts";
import { createExampleApp } from "./utils/examples/create-example-app";

const main = async () => {
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

  config.builtInModels = ['gpt-4o'];

  // Prompt only for the OpenAI API key
  let apiKey = "";
  const { providedApiKey } = await prompts({
    name: "providedApiKey",
    type: "password",
    message: `Enter your OpenAI API key (or press Enter to skip):`,
    initial: "",
  });
  apiKey = providedApiKey || "";

  const { adapter } = await prompts({
    name: "adapter",
    type: "select",
    message: "Which adapter would you like to use?",
    choices: [
      { title: "AI SDK (Vercel)", value: "ai-sdk" },
      { title: "Mastra", value: "mastra" },
    ],
  });

  const { deploymentMode } = await prompts({
    name: "deploymentMode",
    type: "select",
    message: "Use AgentMark Cloud or manage yourself?",
    choices: [
      {
        title: "AgentMark Cloud (recommended)",
        value: "cloud",
        description: "Have AgentMark cloud manage prompts, datasets, traces, experiments, alerts & more"
      },
      {
        title: "Self-hosted",
        value: "static",
        description: "Self-manage your prompts, datasets, traces & experiments"
      },
    ],
  });

  const { client } = await prompts({
    name: "client",
    type: "select",
    message: "Make your IDE an AgentMark expert",
    choices: [
      { title: "Claude Code", value: "claude-code" },
      { title: "Cursor", value: "cursor" },
      { title: "VS Code", value: "vscode" },
      { title: "Zed", value: "zed" },
      { title: "Skip", value: "skip" },
    ],
  });

  await createExampleApp(client, targetPath, apiKey, adapter, deploymentMode);

  // Always generate agentmark.json so config is consistent
  fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
