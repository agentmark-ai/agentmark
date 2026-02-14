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
import { appendGitignore, appendEnv } from "../file-merge.js";
import { shouldMergeFile } from "../conflict-resolution.js";
import type { ProjectInfo, ConflictResolution } from "../types.js";
import { initGitRepo } from "../git-init.js";

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
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
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
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
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
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
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
          },
          "agentmark-traces": {
            command: "npx",
            args: ["@agentmark-ai/mcp-server"],
            env: {
              AGENTMARK_URL: "http://localhost:9418"
            }
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
  deploymentMode: "cloud" | "static" = "cloud",
  projectInfo: ProjectInfo | null = null,
  resolutions: ConflictResolution[] = []
) => {
  try {
    const modelProvider = adapter === 'claude-agent-sdk' ? 'anthropic' : 'openai';
    const model = adapter === 'claude-agent-sdk' ? 'claude-sonnet-4-20250514' : 'gpt-4o';
    const isExistingProject = projectInfo?.isExistingProject ?? false;

    if (isExistingProject) {
      console.log("Adding AgentMark to existing project...");
    } else {
      console.log("Creating AgentMark example app...");
    }

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

    // Create or append to .env file
    if (shouldMergeFile('.env', projectInfo, resolutions)) {
      const envVars: Record<string, string> = {};
      const apiKeyEnvVar = adapter === 'claude-agent-sdk' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
      if (apiKey) {
        envVars[apiKeyEnvVar] = apiKey;
      } else {
        envVars[apiKeyEnvVar] = adapter === 'claude-agent-sdk' ? 'your-anthropic-api-key' : 'your-openai-api-key';
      }
      const result = appendEnv(targetPath, envVars);
      if (result.added.length > 0) {
        console.log(`✅ Added to .env: ${result.added.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.log(`⏭️  Skipped existing .env vars: ${result.skipped.join(', ')}`);
      }
    } else {
      fs.writeFileSync(`${targetPath}/.env`, getEnvFileContent(modelProvider, apiKey, adapter));
    }

    // Create or append to .gitignore
    // Note: .agentmark/ removed - dev-entry.ts is now at project root for version control
    const gitignoreEntries = ['node_modules/', '.env', '*.agentmark-outputs/', 'dist/'];
    if (shouldMergeFile('.gitignore', projectInfo, resolutions)) {
      const result = appendGitignore(targetPath, gitignoreEntries);
      if (result.added.length > 0) {
        console.log(`✅ Added to .gitignore: ${result.added.join(', ')}`);
      }
      if (result.skipped.length > 0) {
        console.log(`⏭️  Already in .gitignore: ${result.skipped.join(', ')}`);
      }
    } else {
      const gitignore = gitignoreEntries.join('\n');
      fs.writeFileSync(`${targetPath}/.gitignore`, gitignore);
    }

    // Create the main application file (skip for existing projects)
    if (!isExistingProject) {
      fs.writeFileSync(
        `${targetPath}/index.ts`,
        getIndexFileContent(adapter, deploymentMode)
      );
    } else {
      console.log("⏭️  Skipped index.ts (existing project)");
    }

    // Create tsconfig.json (skip for existing projects)
    if (!isExistingProject) {
      fs.writeJsonSync(`${targetPath}/tsconfig.json`, getTsConfigContent(), { spaces: 2 });
    } else {
      console.log("⏭️  Skipped tsconfig.json (existing project)");
    }

    // Setup package.json and install dependencies
    const packageManager = projectInfo?.packageManager ?? null;
    setupPackageJson(targetPath, deploymentMode, projectInfo);
    installDependencies(modelProvider, targetPath, adapter, deploymentMode, packageManager);

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

    // Create dev-entry.ts at project root (version controlled)
    console.log("Creating development server entry point...");

    // Get adapter-specific values from config
    const adapterConfig = getAdapterConfig(adapter, modelProvider);
    const { webhookHandler } = adapterConfig.classes;

    const devEntryPath = path.join(targetPath, 'dev-entry.ts');

    const devEntryContent = `// Development webhook server entry point
// This file is version controlled - customize as needed for your project

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
  const { client } = await import('./agentmark.client.js');

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

    // Only create dev-entry.ts if it doesn't exist (preserve existing customizations - FR-003)
    if (fs.existsSync(devEntryPath)) {
      console.log("⏭️  Skipped dev-entry.ts (already exists - preserving customizations)");
    } else {
      fs.writeFileSync(devEntryPath, devEntryContent);
      console.log(`✅ Created dev-entry.ts at project root`);
    }

    // Initialize git repo for new projects
    if (!isExistingProject) {
      initGitRepo(targetPath);
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

    console.log('\n' + '═'.repeat(70));
    console.log('Next Steps');
    console.log('═'.repeat(70));

    // Use detected package manager for instructions
    const runCmd = packageManager?.runCmd ?? 'npm run';

    // Check if agentmark script was namespaced
    const pkgJsonPath = path.join(targetPath, 'package.json');
    let agentmarkScriptName = 'agentmark';
    if (fs.existsSync(pkgJsonPath)) {
      const pkgJson = fs.readJsonSync(pkgJsonPath);
      if (pkgJson.scripts?.['agentmark:agentmark']) {
        agentmarkScriptName = 'agentmark:agentmark';
      }
    }

    console.log('\n Get Started:');
    if (folderName !== "." && folderName !== "./" && !isExistingProject) {
      console.log(`  $ cd ${folderName}`);
    }
    console.log(`  $ ${runCmd} ${agentmarkScriptName} dev\n`);

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
