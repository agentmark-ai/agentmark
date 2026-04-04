import fs from "fs-extra";
import path from "path";
import prompts from "prompts";
import { createExampleApp } from "./utils/examples/create-example-app";
import { createPythonApp } from "./utils/examples/create-python-app";
import { detectProjectInfo, isCurrentDirectory } from "./utils/project-detection.js";
import { displayProjectDetectionSummary, promptForResolutions } from "./utils/conflict-resolution.js";
import type { ProjectInfo, ConflictResolution } from "./utils/types.js";
import { initGitRepo } from "./utils/git-init.js";

interface CliArgs {
  path?: string;
  language?: "typescript" | "python";
  adapter?: string;
  deploymentMode?: "cloud" | "static";
  apiKey?: string;
  client?: string;
  overwrite?: boolean;
}

const VALID_ADAPTERS_TS = ["ai-sdk", "claude-agent-sdk", "mastra"];
const VALID_ADAPTERS_PY = ["pydantic-ai", "claude-agent-sdk"];
const VALID_CLIENTS = ["claude-code", "cursor", "vscode", "zed", "skip"];

const parseArgs = (): CliArgs => {
  const args = process.argv.slice(2);
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--cloud":
        result.deploymentMode = "cloud";
        break;
      case "--self-host":
        result.deploymentMode = "static";
        break;
      case "--python":
        result.language = "python";
        break;
      case "--typescript":
        result.language = "typescript";
        break;
      case "--overwrite":
        result.overwrite = true;
        break;
      case "--path":
        result.path = args[++i];
        break;
      case "--adapter":
        result.adapter = args[++i];
        break;
      case "--api-key":
        result.apiKey = args[++i];
        break;
      case "--client":
        result.client = args[++i];
        break;
    }
  }

  return result;
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

  // Folder name — from --path flag or prompt
  let folderName = cliArgs.path;
  if (!folderName) {
    const response = await prompts({
      name: "folderName",
      type: "text",
      message: "Where would you like to create your AgentMark app?",
      initial: "my-agentmark-app",
    });
    folderName = response.folderName;
  }

  // Determine target path - handle "." for current directory
  const isCurrentDir = isCurrentDirectory(folderName!);
  const targetPath = isCurrentDir ? process.cwd() : path.resolve(folderName!);

  // Create the target folder only if not using current directory
  if (!isCurrentDir) {
    fs.ensureDirSync(targetPath);
  }

  // Detect existing project
  const projectInfo: ProjectInfo = detectProjectInfo(targetPath);

  // Show detection summary if existing project found
  if (projectInfo.isExistingProject) {
    displayProjectDetectionSummary(projectInfo);
  }

  // Prompt for conflict resolutions if needed (--overwrite skips prompts)
  let resolutions: ConflictResolution[];
  if (cliArgs.overwrite) {
    resolutions = projectInfo.conflictingFiles.map((f) => ({
      path: f.path,
      action: "overwrite" as const,
    }));
  } else {
    resolutions = await promptForResolutions(projectInfo.conflictingFiles);
  }

  // Language selection — from flag or prompt
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

  // Adapter selection — from flag or prompt
  let adapter = cliArgs.adapter;
  if (!adapter) {
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
  }

  // Validate adapter for the selected language
  const validAdapters = language === "python" ? VALID_ADAPTERS_PY : VALID_ADAPTERS_TS;
  if (!validAdapters.includes(adapter!)) {
    console.error(`Invalid adapter "${adapter}" for ${language}. Valid: ${validAdapters.join(", ")}`);
    process.exit(1);
  }

  // API key — from flag or prompt
  let apiKey = cliArgs.apiKey ?? "";
  if (!cliArgs.apiKey && cliArgs.apiKey !== "") {
    const apiKeyName = adapter === 'claude-agent-sdk' ? 'Anthropic' : 'OpenAI';
    const { providedApiKey } = await prompts({
      name: "providedApiKey",
      type: "password",
      message: `Enter your ${apiKeyName} API key (or press Enter to skip):`,
      initial: "",
    });
    apiKey = providedApiKey || "";
  }

  // Deployment mode — from flag or prompt
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

  // IDE client — from flag or prompt
  let client = cliArgs.client;
  if (!client) {
    const response = await prompts({
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
    client = response.client;
  }

  // Validate client
  if (!VALID_CLIENTS.includes(client!)) {
    console.error(`Invalid client "${client}". Valid: ${VALID_CLIENTS.join(", ")}`);
    process.exit(1);
  }

  let usedModels: string[];
  if (language === "python") {
    usedModels = await createPythonApp(client!, targetPath, apiKey, deploymentMode, adapter!, projectInfo, resolutions);
  } else {
    usedModels = await createExampleApp(client!, targetPath, apiKey, adapter!, deploymentMode, projectInfo, resolutions);
  }
  config.builtInModels = usedModels;

  if (deploymentMode === "cloud") {
    config.handler = language === "python" ? "handler.py" : "handler.ts";
  }

  // Generate agentmark.json based on conflict resolution
  const agentmarkJsonPath = path.join(targetPath, "agentmark.json");
  const agentmarkJsonResolution = resolutions.find((r) => r.path === "agentmark.json");

  // Write agentmark.json if it doesn't exist or if user chose to overwrite
  if (!fs.existsSync(agentmarkJsonPath) || agentmarkJsonResolution?.action === "overwrite") {
    fs.writeJsonSync(agentmarkJsonPath, config, { spaces: 2 });
  } else if (agentmarkJsonResolution?.action === "skip") {
    console.log("⏭️  Skipped agentmark.json (keeping existing file)");
  }

  // Initialize git repo after ALL files are written (including agentmark.json)
  if (!projectInfo.isExistingProject) {
    initGitRepo(targetPath);
  }
};

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
