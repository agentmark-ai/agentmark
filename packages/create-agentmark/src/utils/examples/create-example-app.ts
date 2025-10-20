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
  getClientConfigContent,
  getDevServerContent,
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
  client: string,
  targetPath: string = ".",
  apiKey: string = ""
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
      getClientConfigContent({ provider: modelProvider, languageModels: langModels })
    );

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, apiKey));

    // Create .gitignore
    const gitignore = ['node_modules', '.env', '.agentmark-output'].join('\n');
    fs.writeFileSync(`${targetPath}/.gitignore`, gitignore);

    // Create the main application file
    fs.writeFileSync(
      `${targetPath}/index.ts`,
      getIndexFileContent()
    );

    // Create dev-server.ts for development
    fs.writeFileSync(
      `${targetPath}/dev-server.ts`,
      getDevServerContent()
    );

    // Create tsconfig.json
    fs.writeJSONSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

    // Setup package.json and install dependencies
    setupPackageJson(targetPath);
    installDependencies(modelProvider, targetPath);

    // Generate types file using the installed CLI
    console.log("Generating types from prompts...");
    try {
      const typesOutput = execSync('npx agentmark generate-types --root-dir agentmark', {
        cwd: targetPath,
        encoding: 'utf-8'
      });
      fs.writeFileSync(`${targetPath}/agentmark.types.ts`, typesOutput);
    } catch (error) {
      console.warn("Warning: Could not generate types automatically:", error);
      console.log("You can generate types later by running: npx agentmark generate-types --root-dir agentmark");
      // Create a placeholder types file
      fs.writeFileSync(`${targetPath}/agentmark.types.ts`, `// Auto-generated types from AgentMark\n// Run 'npx agentmark generate-types --root-dir agentmark' to generate types\nexport default interface AgentmarkTypes {}\n`);
    }

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

    const folderName = targetPath.replace("./", "");

    console.log('\n' + '═'.repeat(70));
    console.log('Next Steps');
    console.log('═'.repeat(70));
    console.log('\n Initialize Server:');
    if (folderName !== ".") {
      console.log(`  $ cd ${folderName}`);
    }
    console.log('  $ npm run dev\n');
    console.log('  Run app demo:');
    console.log('  $ npm run demo');
    console.log('');
    console.log('─'.repeat(70));
    console.log('Resources');
    console.log('─'.repeat(70));
    console.log('  Deploy to Production: https://docs.agentmark.co/platform/getting_started/quickstart');
    console.log('═'.repeat(70) + '\n');
  } catch (error) {
    console.error("Error creating example app:", error);
    throw error;
  }
};
