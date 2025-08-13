#!/usr/bin/env node

// Load environment variables from .env automatically for CLI commands
try { require('dotenv').config(); } catch {}

import { program } from "commander";
import init from "./commands/init";
import serve from "./commands/serve";
import dev from "./commands/dev";
import generateTypes from "./commands/generate-types";
import pullModels from "./commands/pull-models";
import runPrompt from "./commands/run-prompt";
import runExperiment from "./commands/run-experiment";
import clientServe from "./commands/client-serve";

program
  .command("init")
  .description("Intialize the agentmark project")
  .option("-t, --target <target>", "Target to initialize the project for")
  .action(init);

program
  .command("serve")
  .option("-p, --port <number>", "Port to run on (default: 9002)")
  .description("Serve the agentmark templates")
  .action((options) => {
    serve({ port: parseInt(options.port || "9002", 10) });
  });

program
  .command('generate-types')
  .option('-l, --language <language>', 'Language to generate types for', 'typescript')
  .option('--local <port>', 'Local server port number')
  .option('--root-dir <path>', 'Root directory containing agentmark files')
  .action(async (options) => {
    const localPort = options.local ? parseInt(options.local, 10) : undefined;
    await generateTypes({ 
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
      await pullModels();
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("run-prompt <filepath>")
  .description('Run a prompt with test props')
  .option('--runner <path>', 'Path or module id to a project runner')
  .action(async (filepath: string, options: { runner?: string }) => {
    try {
      if (options.runner) process.env.AGENTMARK_RUNNER = options.runner;
      await runPrompt(filepath);
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command('client-serve')
  .description('Serve your local AgentMark client over HTTP')
  .option('-p, --port <number>', 'Port to run on (default: 9417)')
  .option('--client <path>', 'Path or module id to a user AgentMark client config')
  .action(async (options: { port?: string, client?: string }) => {
    if (options.client) process.env.AGENTMARK_CLIENT = options.client;
    await clientServe({ port: options.port ? parseInt(options.port, 10) : undefined });
  });

// Convenience command for running datasets directly
program
  .command("run-experiment <filepath>")
  .description('Run an experiment against its dataset, with evals by default')
  .option('--runner <path>', 'Path or module id to a project runner')
  .option('--skip-eval', 'Skip running evals even if they exist')
  .option('--threshold <percent>', 'Fail if pass percentage is below threshold (0-100)', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) throw new Error('Threshold must be a number');
    if (n < 0 || n > 100) throw new Error('Threshold must be between 0 and 100');
    return n;
  })
  .action(async (filepath: string, options: { runner?: string, skipEval?: boolean, threshold?: number }) => {
    try {
      if (options.runner) process.env.AGENTMARK_RUNNER = options.runner;
      const thresholdPercent = typeof options.threshold === 'number' ? options.threshold : undefined;
      await runExperiment(filepath, { skipEval: !!options.skipEval, thresholdPercent });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program.parse(process.argv);
