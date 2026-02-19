#!/usr/bin/env node

// Load .env file from current working directory
import { config } from 'dotenv';
config();

import { program } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import dev from './commands/dev';
import generateTypes from './commands/generate-types';
import generateSchema from './commands/generate-schema';
import pullModels from './commands/pull-models';
import runPrompt from './commands/run-prompt';
import runExperiment from './commands/run-experiment';
import build from './commands/build';
import login from './commands/login';
import logout from './commands/logout';
import link from './commands/link';
import { startUpdateCheck, displayUpdateNotification } from './update-notifier';

// Start async update check early (non-blocking)
const updateCheckPromise = startUpdateCheck();

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .version(packageJson.version, '-v, --version', 'Output the current version')
  .name('agentmark')
  .description('AgentMark CLI - Build, test, and deploy AI agents');

program
  .command("dev")
  .option("--api-port <number>", "API server port (default: 9418)")
  .option("--webhook-port <number>", "Webhook server port (default: 9417)")
  .option("--app-port <number>", "AgentMark UI app port (default: 3000)")
  .option("-r, --remote", "Connect to platform (login + link + forwarding + tunnel)")
  .option("-t, --tunnel", "Expose webhook server publicly via tunnel")
  .option("--no-forward", "Disable trace forwarding (only relevant with --remote)")
  .description("Start development servers (API server + webhook + UI app)")
  .action(async (options) => {
    await (dev as any)({
      apiPort: options.apiPort ? parseInt(options.apiPort, 10) : undefined,
      webhookPort: options.webhookPort ? parseInt(options.webhookPort, 10) : undefined,
      appPort: options.appPort ? parseInt(options.appPort, 10) : undefined,
      remote: options.remote || false,
      tunnel: options.tunnel || false,
      forward: options.forward, // Commander.js --no-forward sets this to false; defaults to true
    });
  });

program
  .command('generate-types')
  .option('-l, --language <language>', 'Language to generate types for', 'typescript')
  .option('--local <port>', 'Local server port number')
  .option('--root-dir <path>', 'Root directory containing agentmark files')
  .action(async (options) => {
    const localPort = options.local ? parseInt(options.local, 10) : undefined;
    await (generateTypes as any)({
      language: options.language,
      local: localPort,
      rootDir: options.rootDir
    });
  });

program
  .command('generate-schema')
  .description('Generate JSON Schema for .prompt.mdx frontmatter (enables IDE squiggles for model_name)')
  .option('-o, --out <directory>', 'Output directory (default: .agentmark)')
  .action(async (options) => {
    try {
      await (generateSchema as any)({ outDir: options.out });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("pull-models")
  .description('Pull models from a provider')
  .action(async () => {
    try {
      await (pullModels as any)();
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("run-prompt <filepath>")
  .description('Run a prompt with test props')
  .option('--server <url>', 'URL of an AgentMark webhook server (e.g., http://localhost:9417)')
  .option('--props <json>', 'Props as JSON string (e.g., \'{"key": "value"}\')')
  .option('--props-file <path>', 'Path to JSON or YAML file containing props')
  .action(async (filepath: string, options: { server?: string; props?: string; propsFile?: string }) => {
    try {
      await (runPrompt as any)(filepath, options);
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("run-experiment <filepath>")
  .description('Run an experiment against its dataset, with evals by default')
  .option('--server <url>', 'URL of an AgentMark webhook server (e.g., http://localhost:9417)')
  .option('--skip-eval', 'Skip running evals even if they exist')
  .option('--format <format>', 'Output format: table, csv, json, or jsonl (default: table)')
  .option('--threshold <percent>', 'Fail if pass percentage is below threshold (0-100)', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) throw new Error('Threshold must be a number');
    if (n < 0 || n > 100) throw new Error('Threshold must be between 0 and 100');
    return n;
  })
  .action(async (filepath: string, options: { server?: string, skipEval?: boolean, format?: string, threshold?: number }) => {
    try {
      const format = options.format || 'table';
      if (!['table', 'csv', 'json', 'jsonl'].includes(format)) {
        throw new Error('Format must be one of: table, csv, json, jsonl');
      }
      const thresholdPercent = typeof options.threshold === 'number' ? options.threshold : undefined;
      await (runExperiment as any)(filepath, { skipEval: !!options.skipEval, format, thresholdPercent, server: options.server });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("build")
  .description('Build prompts and datasets into pre-compiled JSON files for static loading')
  .option('-o, --out <directory>', 'Output directory (default: dist/agentmark)')
  .action(async (options: { out?: string }) => {
    try {
      await (build as any)({ outDir: options.out });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("login")
  .description('Authenticate with the AgentMark platform')
  .option('--base-url <url>', 'Platform URL (default: https://app.agentmark.co)')
  .action(async (options: { baseUrl?: string }) => {
    try {
      await (login as any)(options);
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("logout")
  .description('Clear CLI authentication and revoke dev API keys')
  .option('--base-url <url>', 'Platform URL (default: https://app.agentmark.co)')
  .action(async (options: { baseUrl?: string }) => {
    try {
      await (logout as any)(options);
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("link")
  .description('Link current project to a platform app for trace forwarding')
  .option('--app-id <uuid>', 'App ID to link (skips interactive selection)')
  .option('--base-url <url>', 'Platform URL (default: https://app.agentmark.co)')
  .action(async (options: { appId?: string; baseUrl?: string }) => {
    try {
      await (link as any)(options);
    } catch (error) {
      program.error((error as Error).message);
    }
  });

// Parse and run command, then display update notification
// Using parseAsync ensures notification displays after command completes
program.parseAsync(process.argv).then(async () => {
  try {
    const result = await updateCheckPromise;
    displayUpdateNotification(result);
  } catch {
    // Silent failure - never interrupt CLI due to update check
  }
});
