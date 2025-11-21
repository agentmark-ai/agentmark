#!/usr/bin/env node

// Load .env file from current working directory
import { config } from 'dotenv';
config();

import { program } from "commander";
import { readFileSync } from "fs";
import { join } from "path";
import dev from './commands/dev';
import generateTypes from './commands/generate-types';
import pullModels from './commands/pull-models';
import runPrompt from './commands/run-prompt';
import runExperiment from './commands/run-experiment';
import initDeploy from './commands/init-deploy';

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .version(packageJson.version, '-v, --version', 'Output the current version')
  .name('agentmark')
  .description('AgentMark CLI - Build, test, and deploy AI agents');

program
  .command("dev")
  .option("-p, --port <number>", "File server port (default: 9418)")
  .option("-w, --webhook-port <number>", "Webhook server port (default: 9417)")
  .option("-t, --tunnel", "Expose webhook server publicly via ngrok tunnel")
  .description("Start development servers (file server + webhook)")
  .action(async (options) => {
    await (dev as any)({
      port: options.port ? parseInt(options.port, 10) : undefined,
      webhookPort: options.webhookPort ? parseInt(options.webhookPort, 10) : undefined,
      tunnel: options.tunnel || false
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
  .command("init-deploy")
  .description('Setup deployment configuration for Railway, Render, or Docker')
  .action(async () => {
    try {
      await (initDeploy as any)();
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program.parse(process.argv);
