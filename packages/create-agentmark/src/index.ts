import fs from "fs-extra";
import prompts from "prompts";
import { createExampleApp } from "./utils/examples/create-example-app";
import { createPythonApp } from "./utils/examples/create-python-app";

const parseArgs = () => {
  const args = process.argv.slice(2);
  let deploymentMode: "cloud" | "static" | undefined;
  let language: "typescript" | "python" | undefined;

  for (const arg of args) {
    if (arg === "--cloud") {
      deploymentMode = "cloud";
    } else if (arg === "--self-host") {
      deploymentMode = "static";
    } else if (arg === "--python") {
      language = "python";
    } else if (arg === "--typescript") {
      language = "typescript";
    }
  }

  return { deploymentMode, language };
};

const main = async () => {
  const cliArgs = parseArgs();
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

  // Language selection
  let language = cliArgs.language;
  if (!language) {
    const response = await prompts({
      name: "language",
      type: "select",
      message: "Which language would you like to use?",
      choices: [
        { title: "TypeScript", value: "typescript" },
        { title: "Python", value: "python" },
      ],
    });
    language = response.language;
  }

  // Adapter selection depends on language
  let adapter: string;
  if (language === "python") {
    const response = await prompts({
      name: "adapter",
      type: "select",
      message: "Which adapter would you like to use?",
      choices: [
        { title: "Pydantic AI", value: "pydantic-ai" },
        { title: "Claude Agent SDK", value: "claude-agent-sdk" },
      ],
    });
    adapter = response.adapter;
  } else {
    const response = await prompts({
      name: "adapter",
      type: "select",
      message: "Which adapter would you like to use?",
      choices: [
        { title: "AI SDK (Vercel)", value: "ai-sdk" },
        { title: "Claude Agent SDK", value: "claude-agent-sdk" },
        { title: "Mastra", value: "mastra" },
      ],
    });
    adapter = response.adapter;
  }

  // Set built-in models based on adapter
  config.builtInModels = adapter === 'claude-agent-sdk'
    ? ['claude-sonnet-4-20250514']
    : ['gpt-4o'];

  // Prompt for API key based on adapter
  const apiKeyName = adapter === 'claude-agent-sdk' ? 'Anthropic' : 'OpenAI';
  let apiKey = "";
  const { providedApiKey } = await prompts({
    name: "providedApiKey",
    type: "password",
    message: `Enter your ${apiKeyName} API key (or press Enter to skip):`,
    initial: "",
  });
  apiKey = providedApiKey || "";

  let deploymentMode = cliArgs.deploymentMode;
  if (!deploymentMode) {
    const response = await prompts({
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
    deploymentMode = response.deploymentMode;
  }

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

  if (language === "python") {
    await createPythonApp(client, targetPath, apiKey, deploymentMode, adapter);
  } else {
    await createExampleApp(client, targetPath, apiKey, adapter, deploymentMode);
  }

  // Always generate agentmark.json so config is consistent
  fs.writeJsonSync(`${targetPath}/agentmark.json`, config, { spaces: 2 });
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
