/**
 * CLI Deploy Command
 *
 * Implements `agentmark deploy` - deploys agentmark files directly to a
 * non-git platform app.
 *
 * Flow:
 * 1. Resolve auth: --api-key flag > AGENTMARK_API_KEY env > stored credentials
 * 2. Resolve app ID: --app-id flag > AGENTMARK_APP_ID env > forwarding config
 * 3. Read agentmark.json to find source directory
 * 4. Collect all agentmark files (.prompt.mdx, .mdx, .md, .jsonl)
 * 5. If --dry-run, list files and exit
 * 6. POST files to /api/cli/deploy
 */

import { Command } from "commander";
import path from "path";
import fs from "fs-extra";
import {
  loadCredentials,
  isExpired,
} from "../auth/credentials";
import { refreshAccessToken } from "../auth/token-refresh";
import { loadForwardingConfig } from "../forwarding/config";
import {
  DEFAULT_PLATFORM_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from "../auth/constants";

export const EXIT_CODES = {
  SUCCESS: 0,
  AUTH_FAILURE: 1,
  VALIDATION_FAILURE: 2,
  PERMISSION_DENIED: 3,
  DEPLOYMENT_CONFLICT: 4,
  SERVER_ERROR: 5,
} as const;

interface DeployFile {
  path: string;
  content: string;
}

/**
 * Reads the agentmark.json config file from the current directory.
 */
function getAgentmarkConfig(): { agentmarkPath?: string; scores?: Record<string, unknown> } {
  const configPath = path.join(process.cwd(), "agentmark.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(
      "agentmark.json not found in current directory. Run this command from your AgentMark project root."
    );
  }
  return fs.readJsonSync(configPath);
}

/**
 * Recursively collect all deployable files from a directory.
 * Returns files with paths relative to the source directory.
 */
async function collectFiles(sourceDir: string): Promise<DeployFile[]> {
  const files: DeployFile[] = [];
  const deployablePattern = /\.(prompt\.mdx|mdx|md|jsonl)$/;

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && deployablePattern.test(entry.name)) {
        const relativePath = path.relative(sourceDir, fullPath).replace(/\\/g, "/");
        const content = await fs.readFile(fullPath, "utf-8");
        files.push({ path: relativePath, content });
      }
    }
  }

  await walk(sourceDir);
  return files;
}

/**
 * Factory function that creates the `agentmark deploy` commander command.
 */
export default function createDeployCommand(): Command {
  const cmd = new Command("deploy");

  cmd
    .description("Deploy agentmark files to a platform app (non-git apps only)")
    .option("--app-id <uuid>", "App ID to deploy to (uses linked app if omitted)")
    .option("--api-key <key>", "API key for authentication (overrides env var and stored credentials)")
    .option("-m, --message <message>", "Deployment message/description")
    .option("--dry-run", "List files that would be deployed without actually deploying")
    .option("--base-url <url>", "Platform URL (default: https://app.agentmark.co)")
    .action(async (options: {
      appId?: string;
      apiKey?: string;
      message?: string;
      dryRun?: boolean;
      baseUrl?: string;
    }) => {
      const platformUrl = options.baseUrl || process.env.AGENTMARK_BASE_URL || DEFAULT_PLATFORM_URL;

      // Auth resolution: --api-key flag > AGENTMARK_API_KEY env > stored credentials
      const apiKey = options.apiKey || process.env.AGENTMARK_API_KEY;
      let authToken: string;

      if (apiKey) {
        authToken = apiKey;
      } else {
        let credentials = loadCredentials();
        if (!credentials) {
          console.log("Not logged in. Run `agentmark login` first.");
          process.exit(EXIT_CODES.AUTH_FAILURE);
          return;
        }

        if (isExpired(credentials)) {
          console.log("Token expired, refreshing...");
          const refreshed = await refreshAccessToken(
            credentials,
            DEFAULT_SUPABASE_URL,
            DEFAULT_SUPABASE_ANON_KEY
          );
          if (!refreshed) {
            console.log("Token refresh failed. Run `agentmark login` again.");
            process.exit(EXIT_CODES.AUTH_FAILURE);
            return;
          }
          credentials = refreshed;
        }

        authToken = credentials.access_token;
      }

      // App ID resolution: --app-id flag > AGENTMARK_APP_ID env > forwarding config
      let appId = options.appId || process.env.AGENTMARK_APP_ID;
      if (!appId) {
        const forwardingConfig = loadForwardingConfig();
        if (forwardingConfig?.appId) {
          appId = forwardingConfig.appId;
          console.log(`Deploying to linked app: ${forwardingConfig.appName || appId}`);
        } else {
          console.log(
            "No app specified. Either run `agentmark link` first or pass --app-id <uuid>."
          );
          process.exit(EXIT_CODES.VALIDATION_FAILURE);
          return;
        }
      }

      // Read config and collect files
      const config = getAgentmarkConfig();
      const agentmarkPath = config.agentmarkPath || ".";
      const sourceDir = path.resolve(process.cwd(), agentmarkPath, "agentmark");

      if (!fs.existsSync(sourceDir)) {
        console.log(
          `AgentMark directory not found: ${sourceDir}. Check your agentmark.json configuration.`
        );
        process.exit(EXIT_CODES.VALIDATION_FAILURE);
        return;
      }

      console.log(`Collecting files from ${sourceDir}...`);
      const files = await collectFiles(sourceDir);

      if (files.length === 0) {
        console.log("No deployable files found (.prompt.mdx, .mdx, .md, .jsonl).");
        process.exit(EXIT_CODES.VALIDATION_FAILURE);
        return;
      }

      console.log(`Found ${files.length} file(s) to deploy.`);

      // Dry-run mode: list files and exit without deploying
      if (options.dryRun) {
        console.log("\nDry run complete. Files that would be deployed:");
        for (const file of files) {
          console.log(`  ${file.path}`);
        }
        if (config.scores) {
          const scoreNames = Object.keys(config.scores);
          if (scoreNames.length > 0) {
            console.log(`\nScore configs that would be deployed (${scoreNames.length}):`);
            for (const name of scoreNames) {
              console.log(`  ${name}`);
            }
          }
        }
        process.exit(EXIT_CODES.SUCCESS);
        return;
      }

      // Deploy to platform
      const deployUrl = `${platformUrl}/api/cli/deploy`;
      const response = await fetch(deployUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ appId, files, scores: config.scores, message: options.message }),
      });

      if (response.status < 200 || response.status >= 300) {
        if (response.status === 401) {
          const errorData = await response.json().catch(() => ({ error: "" }));
          const errorMessage = (errorData as { error?: string }).error;
          if (errorMessage) {
            console.log(`Authentication failed: ${errorMessage}`);
          } else {
            console.log("Authentication failed. Run `agentmark login` again.");
          }
          process.exit(EXIT_CODES.AUTH_FAILURE);
        } else if (response.status === 403) {
          const errorData = await response.json().catch(() => ({ error: "Permission denied" }));
          const errorMessage = (errorData as { error?: string }).error || `HTTP ${response.status}`;
          console.log(`Permission denied: ${errorMessage}`);
          process.exit(EXIT_CODES.PERMISSION_DENIED);
        } else if (response.status === 409) {
          const errorData = await response.json().catch(() => ({ error: "Conflict" }));
          const errorMessage = (errorData as { error?: string }).error || `HTTP ${response.status}`;
          console.log(
            `Deployment blocked: ${errorMessage}\n\nThis app is connected to a git repository. CLI deployments only work with non-git apps.`
          );
          process.exit(EXIT_CODES.DEPLOYMENT_CONFLICT);
        } else if (response.status === 422) {
          const errorData = await response.json().catch(() => ({ error: "Validation failed" }));
          const errorMessage = (errorData as { error?: string }).error || `HTTP ${response.status}`;
          console.log(`Validation failed: ${errorMessage}`);
          process.exit(EXIT_CODES.VALIDATION_FAILURE);
        } else {
          // 5xx and other errors
          console.log(`Deployment failed: HTTP ${response.status}`);
          process.exit(EXIT_CODES.SERVER_ERROR);
        }
        return;
      }

      const result = (await response.json()) as {
        deploymentId: string;
        filesDeployed?: number;
        filesSkipped?: number;
      };

      console.log("\nDeployment successful!");
      console.log(`  Deployment ID: ${result.deploymentId}`);
      if (result.filesDeployed !== undefined) {
        console.log(`  Files deployed: ${result.filesDeployed}`);
      }
      if (result.filesSkipped && result.filesSkipped > 0) {
        console.log(`  Files skipped (unchanged): ${result.filesSkipped}`);
      }
      if (config.scores && Object.keys(config.scores).length > 0) {
        console.log(`  Score configs: ${Object.keys(config.scores).length}`);
      }

      process.exit(EXIT_CODES.SUCCESS);
    });

  return cmd;
}
