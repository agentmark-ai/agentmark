import fs from "fs-extra";
import * as path from "path";
import { Providers } from "../providers.js";
import {
  setupPackageJson,
  installDependencies,
  getIndexFileContent,
  getTsConfigContent,
  getEnvFileContent,
  createExamplePrompts,
  getClientConfigContent,
  getAdapterConfig,
} from "./templates/index.js";
import { fetchPromptsFrontmatter, generateTypeDefinitions } from "@agentmark-ai/shared-utils";

const setupMCPServer = (client: string, targetPath: string) => {
  if (client === "skip") {
    console.log("Skipping MCP server setup.");
    return;
  }

  // Keep ./ prefix for display in messages
  const folderName = targetPath;

  // Handle VS Code
  if (client === "vscode") {
    try {
      console.log(`Setting up MCP server for VS Code in ${folderName}...`);
      const vscodeDir = path.join(targetPath, ".vscode");
      fs.ensureDirSync(vscodeDir);

      const mcpConfig = {
        servers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          }
        }
      };

      fs.writeJsonSync(path.join(vscodeDir, "mcp.json"), mcpConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for VS Code in ${folderName}/.vscode/mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for VS Code:`, error);
      console.log("See https://docs.agentmark.co/agentmark/further_reference/agentmark-mcp for setup instructions.");
    }
    return;
  }

  // Handle Zed
  if (client === "zed") {
    try {
      console.log(`Setting up MCP server for Zed in ${folderName}...`);
      const zedDir = path.join(targetPath, ".zed");
      fs.ensureDirSync(zedDir);

      const zedConfig = {
        context_servers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          }
        }
      };

      fs.writeJsonSync(path.join(zedDir, "settings.json"), zedConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for Zed in ${folderName}/.zed/settings.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Zed:`, error);
      console.log("See https://docs.agentmark.co/agentmark/further_reference/agentmark-mcp for setup instructions.");
    }
    return;
  }

  // Handle Cursor
  if (client === "cursor") {
    try {
      console.log(`Setting up MCP server for Cursor in ${folderName}...`);
      const cursorDir = path.join(targetPath, ".cursor");
      fs.ensureDirSync(cursorDir);

      const cursorConfig = {
        mcpServers: {
          "agentmark-docs": {
            url: "https://docs.agentmark.co/mcp"
          }
        }
      };

      fs.writeJsonSync(path.join(cursorDir, "mcp.json"), cursorConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for Cursor in ${folderName}/.cursor/mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Cursor:`, error);
      console.log("See https://docs.agentmark.co/agentmark/further_reference/agentmark-mcp for setup instructions.");
    }
    return;
  }

  // Handle Claude Code
  if (client === "claude-code") {
    try {
      console.log(`Setting up MCP server for Claude Code in ${folderName}...`);

      const mcpConfig = {
        mcpServers: {
          "agentmark-docs": {
            type: "http",
            url: "https://docs.agentmark.co/mcp"
          }
        }
      };

      fs.writeJsonSync(path.join(targetPath, ".mcp.json"), mcpConfig, { spaces: 2 });
      console.log(`✅ MCP server configured for Claude Code in ${folderName}/.mcp.json`);
    } catch (error) {
      console.warn(`Warning: Could not set up MCP server for Claude Code:`, error);
      console.log("See https://docs.agentmark.co/agentmark/further_reference/agentmark-mcp for setup instructions.");
    }
    return;
  }
};


export const createExampleApp = async (
  client: string,
  targetPath: string = ".",
  apiKey: string = "",
  adapter: string = "ai-sdk",
  deploymentMode: "cloud" | "static" = "cloud"
) => {
  try {
    const modelProvider = 'openai';
    const model = 'gpt-4o';
    console.log("Creating Agent Mark example app...");

    // Keep ./ prefix for display in messages
    const folderName = targetPath;

    // Create directory structure
    fs.ensureDirSync(`${targetPath}/agentmark`);

    setupMCPServer(client, targetPath);

    // Create example prompts
    createExamplePrompts(model, targetPath, adapter);
    console.log(`✅ Example prompts and datasets created in ${folderName}/agentmark/`);

    // Create user client config at project root
    // Prefer TS for dev ergonomics
    const langModels = Providers[modelProvider as keyof typeof Providers].languageModels.slice(0, 1);
    fs.writeFileSync(
      `${targetPath}/agentmark.client.ts`,
      getClientConfigContent({ provider: modelProvider, languageModels: langModels, adapter, deploymentMode })
    );

    // Create .env file
    fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, apiKey));

    // Create .gitignore
    const gitignore = ['node_modules', '.env', '*.agentmark-outputs/', '.agentmark', 'dist'].join('\n');
    fs.writeFileSync(`${targetPath}/.gitignore`, gitignore);

    // Create the main application file
    fs.writeFileSync(
      `${targetPath}/index.ts`,
      getIndexFileContent(adapter)
    );

    // Create tsconfig.json
    fs.writeJsonSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });

    // Setup package.json and install dependencies
    setupPackageJson(targetPath, deploymentMode);
    installDependencies(modelProvider, targetPath, adapter, deploymentMode);

    // Generate types file using the type generation library
    console.log("Generating types from prompts...");
    try {
      const agentmarkDir = path.join(targetPath, 'agentmark');
      const prompts = await fetchPromptsFrontmatter({ rootDir: agentmarkDir });
      const typeDefinitions = await generateTypeDefinitions(prompts);
      fs.writeFileSync(`${targetPath}/agentmark.types.ts`, typeDefinitions);
    } catch (error) {
      console.warn("Warning: Could not generate types automatically:", error);
      console.log("You can generate types later by running: npx agentmark generate-types --root-dir agentmark");
      // Create a placeholder types file
      fs.writeFileSync(`${targetPath}/agentmark.types.ts`, `// Auto-generated types from AgentMark\n// Run 'npx agentmark generate-types --root-dir agentmark' to generate types\nexport default interface AgentmarkTypes {}\n`);
    }

    // Create .agentmark directory and dev-entry.ts
    console.log("Creating development server entry point...");
    const agentmarkInternalDir = path.join(targetPath, '.agentmark');
    fs.ensureDirSync(agentmarkInternalDir);

    // Get adapter-specific values from config
    const adapterConfig = getAdapterConfig(adapter, modelProvider);
    const { webhookHandler } = adapterConfig.classes;

    const devEntryContent = `// Auto-generated webhook server entry point
// To customize, create a dev-server.ts file in your project root

import { createWebhookServer } from '@agentmark-ai/cli/runner-server';
import { ${webhookHandler} } from '${adapterConfig.package}/runner';
import { AgentMarkSDK } from '@agentmark-ai/sdk';
import path from 'path';

async function main() {
  const args = process.argv.slice(2);
  const webhookPortArg = args.find(arg => arg.startsWith('--webhook-port='));
  const apiServerPortArg = args.find(arg => arg.startsWith('--api-server-port='));

  const webhookPort = webhookPortArg ? parseInt(webhookPortArg.split('=')[1]) : 9417;
  const apiServerPort = apiServerPortArg ? parseInt(apiServerPortArg.split('=')[1]) : 9418;
  const apiServerUrl = \`http://localhost:\${apiServerPort}\`;

  // Set environment for development mode before importing client
  process.env.NODE_ENV = 'development';
  process.env.AGENTMARK_BASE_URL = apiServerUrl;

  // Now import client - it will pick up the dev environment
  const { client } = await import('../agentmark.client.js');

  // Initialize OpenTelemetry tracing to export traces to the API server
  const sdk = new AgentMarkSDK({
    apiKey: '',
    appId: '',
    baseUrl: apiServerUrl,
  });
  sdk.initTracing({ disableBatch: true });

  const handler = new ${webhookHandler}(client as any);
  const templatesDirectory = path.join(process.cwd(), 'agentmark');

  await createWebhookServer({
    port: webhookPort,
    handler,
    apiServerUrl,
    templatesDirectory
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
`;

    fs.writeFileSync(path.join(agentmarkInternalDir, 'dev-entry.ts'), devEntryContent);

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

    console.log('\n' + '═'.repeat(70));
    console.log('Next Steps');
    console.log('═'.repeat(70));

    // Simplified instructions - always just "npm run dev"
    console.log('\n Get Started:');
    if (folderName !== "." && folderName !== "./") {
      console.log(`  $ cd ${folderName}`);
    }
    console.log('  $ npm run dev\n');

    console.log('─'.repeat(70));
    console.log('Resources');
    console.log('─'.repeat(70));
    console.log('  Documentation: https://docs.agentmark.co');
    console.log('═'.repeat(70) + '\n');
  } catch (error) {
    console.error("Error creating example app:", error);
    throw error;
  }
};
