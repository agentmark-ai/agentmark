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

  createExampleApp(provider, model, (deployTarget as 'cloud' | 'local'), client, targetPath, apiKey, agentmarkApiKey, agentmarkAppId);

  // Always generate agentmark.json so config is consistent across local and cloud
  fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });
  if (deployTarget === "cloud") {
    console.log(
      "🚀 Deploy your AgentMark app: https://docs.agentmark.co/platform/getting_started/quickstart"
    );
    console.log(
      "🪝 Setup your AgentMark webhook: https://docs.agentmark.co/platform/configuration/test-webhook"
    );
  }

  // Auto-start local services after init (background), except during tests
  // For cloud: start both local cloud (CDN) and runner. For local: start runner only.
  try {
    if (process.env.NODE_ENV !== 'test') {
      const { spawn } = await import('node:child_process');
      const isCloud = deployTarget === 'cloud';
      if (isCloud) {
        const cloud = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['@agentmark/cli', 'serve'], {
          cwd: targetPath,
          stdio: 'ignore',
          detached: true,
          env: { ...process.env, PORT: '9418' },
        });
        cloud.unref();
      }
      const runner = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['ts-node', 'agentmark.runner.ts'], {
        cwd: targetPath,
        stdio: 'ignore',
        detached: true,
        env: { ...process.env },
      });
      runner.unref();
      console.log(`\n▶️  Services started:`);
      if (isCloud) console.log(`✅   • Local AgentMark Cloud: http://localhost:9418`);
      console.log(`✅   • Runner: http://localhost:9417`);
      console.log(`   You can stop them by killing the processes, or run manually with:`);
      if (isCloud) console.log(`     - cd ${targetPath} && npm run agentmark:serve-cloud`);
      console.log(`     - cd ${targetPath} && npm run agentmark:serve-runner`);
    }
  } catch {}
};

export default init;