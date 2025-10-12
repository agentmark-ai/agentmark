import * as fs from "fs-extra";
import * as path from "path";
import { execSync } from "child_process";
import { Providers } from "../providers";
import {
  setupPackageJson,
  installDependencies,
  getIndexFileContent,
  getTsConfigContent,
  getEnvFileContent,
  createExamplePrompts,
  getTypesFileContent,
  getClientConfigContent,
} from "./templates";

const setupMCPServer = (client: string, targetPath: string) => {
  if (client === "skip") {
    console.log("Skipping MCP server setup.");
    return;
  }

  const folderName = targetPath.replace("./", "");

  // Handle VS Code separately since mint-mcp doesn't support it
  if (client === "vscode") {
    try {
      console.log(`Setting up MCP server for VS Code in ${folderName}...`);
      const vscodeDir = path.join(targetPath, ".vscode");
      fs.ensureDirSync(vscodeDir);

      const mcpConfig = {
        servers: {
          "agentmark-docs": {
            command: "npx",
            args: ["-y", "@mintlify/mcp", "docs.agentmark.co"]
          }
        }
      };

      fs.writeJsonSync(path.join(vscodeDir, "mcp.json"), mcpConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for VS Code in ${folderName}/.vscode/mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for VS Code:`, error);
      console.log("You can manually create .vscode/mcp.json with the AgentMark docs MCP server configuration.");
    }
    return;
  }

  // Handle Zed separately since mint-mcp doesn't support it
  if (client === "zed") {
    try {
      console.log(`Setting up MCP server for Zed in ${folderName}...`);
      const zedDir = path.join(targetPath, ".zed");
      fs.ensureDirSync(zedDir);

      const zedConfig = {
        context_servers: {
          "agentmark-docs": {
            source: "custom",
            command: "npx",
            args: ["-y", "@mintlify/mcp", "docs.agentmark.co"],
            env: {}
          }
        }
      };

      fs.writeJsonSync(path.join(zedDir, "settings.json"), zedConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for Zed in ${folderName}/.zed/settings.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Zed:`, error);
      console.log("You can manually create .zed/settings.json with the AgentMark docs MCP server configuration.");
    }
    return;
  }

  // Handle other clients via mint-mcp
  try {
    console.log(`Setting up MCP server for ${client} in ${folderName}...`);
    execSync(`npx mint-mcp add docs.agentmark.co --client ${client}`, {
      stdio: "inherit",
      cwd: targetPath,
    });
    console.log(`✅ MCP server configured for ${client} in ${folderName}`);
  } catch (error) {
    console.warn(`Warning: Could not set up MCP server for ${client}:`, error);
    console.log("You can manually set it up later by running this command in your project folder:");
    console.log(`cd ${folderName}`);
    console.log(`npx mint-mcp add docs.agentmark.co --client ${client}`);
  }
};

export const createExampleApp = async (
  modelProvider: string,
  model: string,
  target: 'cloud' | 'local' = "cloud",
  client: string,
  targetPath: string = ".",
  apiKey: string = "",
  agentmarkApiKey: string = "",
  agentmarkAppId: string = ""
) => {
  try {
    console.log("Creating Agent Mark example app...");

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts
    createExamplePrompts(model, targetPath);

    // Create user client config at project root
    // Prefer TS for dev ergonomics
    const langModels = Providers[modelProvider as keyof typeof Providers].languageModels.slice(0, 1);
    fs.writeFileSync(
      `${targetPath}/agentmark.config.ts`,
      getClientConfigContent({ defaultRootDir: `./agentmark`, provider: modelProvider, languageModels: langModels, target })
    );

    // Create types file
    fs.writeFileSync(`${targetPath}/agentmark.types.ts`, getTypesFileContent());

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, target, apiKey, agentmarkApiKey, agentmarkAppId));

    // Create .gitignore
    const gitignore = ['node_modules', '.env', 'agentmark-output'].join('\n');
    fs.writeFileSync(`${targetPath}/.gitignore`, gitignore);

    // Create the main application file
    fs.writeFileSync(
      `${targetPath}/index.ts`,
      getIndexFileContent(modelProvider, model, target)
    );

    // Create tsconfig.json
    fs.writeJSONSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

    // Setup package.json and install dependencies
    setupPackageJson(targetPath, target);
    installDependencies(modelProvider, target, targetPath);

    // Success message
    console.log("\n✅ Agentmark initialization completed successfully!");

    console.log(
      `
 █████╗  ██████╗ ███████╗███╗   ██╗████████╗███╗   ███╗ █████╗ ██████╗ ██╗  ██╗
██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝████╗ ████║██╔══██╗██╔══██╗██║ ██╔╝
███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ██╔████╔██║███████║██████╔╝█████╔╝
██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ██║╚██╔╝██║██╔══██║██╔══██╗██╔═██╗
██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ██║ ╚═╝ ██║██║  ██║██║  ██║██║  ██╗
╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝

    `
    );

    console.log("To get started:");
    const folderName = targetPath.replace("./", "");
    if (folderName !== ".") {
      console.log(`  cd ${folderName}`);
    }
    console.log(`  npm run dev`);
  } catch (error) {
    console.error("Error creating example app:", error);
    throw error;
  }
};
