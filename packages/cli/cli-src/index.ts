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
import doctor from './commands/doctor';
import init, { ALL_CLIENTS } from './commands/init';
import type { McpClient } from './commands/init/mcp-config';
import { startUpdateCheck, displayUpdateNotification } from './update-notifier';

// Start async update check early (non-blocking)
const updateCheckPromise = startUpdateCheck();

// Read version from package.json
const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

program
  .version(packageJson.version, '-v, --version', 'Output the current version')
  .name('agentmark')
  .description('AgentMark CLI - Build and test AI agents');

/** Parses `--client claude-code,cursor` / `--client all` into a client list. */
const parseClientList = (value?: string): McpClient[] | undefined => {
  if (!value) return undefined;
  if (value === "all") return [...ALL_CLIENTS];
  return value.split(",").map((s) => s.trim()).filter(Boolean) as McpClient[];
};

program
  .command("init [folder]")
  .description("Set up AgentMark in a new or existing project: writes agentmark.json, creates the prompts dir, pins @agentmark-ai/cli locally, and wires IDE MCP configs")
  .option("--path <folder>", "Target directory (alternative to the positional [folder]). Default: \".\" inside an existing project, else \"my-agentmark-app\"")
  .option("--client <ids>", "IDE clients to wire MCP configs for, comma-separated: claude-code, codex, cursor, vscode, zed (or \"all\")")
  .option("-y, --yes", "Non-interactive: accept the default for every prompt (folder default, all IDE clients, keep an existing agentmark.json). For CI and coding agents")
  .option("--overwrite", "Replace an existing agentmark.json with the default config")
  .option("--api-url <url>", "Override the AgentMark gateway URL for the cloud MCP entry (internal staging / self-host)")
  .action(async (folder: string | undefined, options: { path?: string; client?: string; yes?: boolean; overwrite?: boolean; apiUrl?: string }) => {
    if (options.apiUrl && !/^https?:\/\//.test(options.apiUrl)) {
      program.error(`--api-url requires a full http(s) URL (got "${options.apiUrl}")`);
    }
    try {
      await init({
        path: folder ?? options.path,
        clients: parseClientList(options.client),
        yes: options.yes,
        overwrite: options.overwrite,
        apiUrl: options.apiUrl,
        cliVersion: packageJson.version as string,
      });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("doctor")
  .description("Check that your AgentMark project is set up correctly (config, prompts, client, dependencies)")
  .option("--json", "Emit the report as JSON instead of human-readable text")
  .option("--strict", "Exit non-zero on warnings too (useful in CI)")
  .option("--smoke", "Also run a live tier: execute a prompt against `agentmark dev` and verify the emitted trace")
  .option("--boot", "With --smoke, start `agentmark dev` automatically and tear it down after (one command, e.g. for CI/agents)")
  .option("--prompt <path>", "Prompt to run for --smoke (defaults to the first prompt found)")
  .option("--props <json>", "Props as a JSON string for the --smoke prompt (requires --prompt; e.g. '{\"name\":\"Alice\"}')")
  .option("--webhook-port <number>", "Webhook port --smoke targets / --boot starts dev on (default: 9417)")
  .option("--api-port <number>", "API-server port --smoke reads traces from / --boot starts dev on (default: 9418)")
  .action(async (options: { json?: boolean; strict?: boolean; smoke?: boolean; boot?: boolean; prompt?: string; props?: string; webhookPort?: string; apiPort?: string }) => {
    let parsedProps: Record<string, unknown> | undefined;
    if (options.props) {
      if (!options.prompt) {
        program.error("--props requires --prompt <path> (props only make sense for a specific prompt)");
      }
      try {
        parsedProps = JSON.parse(options.props) as Record<string, unknown>;
      } catch {
        program.error("--props must be valid JSON (e.g. '{\"name\":\"Alice\"}')");
      }
    }
    try {
      await doctor({
        json: options.json,
        strict: options.strict,
        smoke: options.smoke,
        boot: options.boot,
        prompt: options.prompt,
        props: parsedProps,
        webhookPort: options.webhookPort ? parseInt(options.webhookPort, 10) : undefined,
        apiPort: options.apiPort ? parseInt(options.apiPort, 10) : undefined,
      });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("dev")
  .option("--api-port <number>", "API server port (default: 9418)")
  .option("--webhook-port <number>", "Webhook server port (default: 9417)")
  .option("--app-port <number>", "AgentMark UI app port (default: 3000)")
  .option("--no-forward", "Disable trace forwarding to AgentMark Cloud")
  .option("--no-ui", "Skip the UI app (API + webhook only) — for CI / headless / test use")
  .option("--no-watch", "Don't restart on file changes; exit on a dev-entry crash so the error surfaces (for CI / headless / boot use)")
  .description("Start development servers (API server + webhook + UI app)")
  .action(async (options) => {
    await (dev as any)({
      apiPort: options.apiPort ? parseInt(options.apiPort, 10) : undefined,
      webhookPort: options.webhookPort ? parseInt(options.webhookPort, 10) : undefined,
      appPort: options.appPort ? parseInt(options.appPort, 10) : undefined,
      forward: options.forward, // Commander.js --no-forward sets this to false; defaults to true
      ui: options.ui, // Commander.js --no-ui sets this to false; defaults to true
      watch: options.watch, // Commander.js --no-watch sets this to false; defaults to true
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
  .option('--provider <name>', 'Provider key (skips the interactive picker)')
  .option('--models <csv>', 'Comma-separated model IDs to add (skips the interactive multi-select)')
  .option('--list', 'Print available providers (or models for --provider <name>) as JSON and exit — no agentmark.json changes')
  .action(async (options: { provider?: string; models?: string; list?: boolean }) => {
    try {
      await (pullModels as any)(options);
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
  .option('--format <format>', 'Output format: table, csv, json, jsonl, or junit (default: table)')
  .option('--threshold <percent>', 'Fail if pass percentage is below threshold (0-100)', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) throw new Error('Threshold must be a number');
    if (n < 0 || n > 100) throw new Error('Threshold must be between 0 and 100');
    return n;
  })
  .option('--sample <percent>', 'Sample N% of dataset rows randomly', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 1 || n > 100) throw new Error('Sample must be an integer between 1 and 100');
    return n;
  })
  .option('--rows <spec>', 'Select specific rows by index/range (e.g., 0,3-5,9)')
  .option('--split <spec>', 'Train/test split (e.g., train:80, test:80)')
  .option('--seed <number>', 'Seed for reproducible sampling/splitting', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) throw new Error('Seed must be a finite integer');
    return n;
  })
  .option('--truncate <chars>', 'Truncate table cell content to N chars (default: 1000, 0 = no limit)', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 0) throw new Error('Truncate must be a non-negative integer');
    return n;
  })
  .option('--concurrency <number>', 'Dataset rows to run in parallel (default: 20)', (v) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n < 1) throw new Error('Concurrency must be a positive integer');
    return n;
  })
  .option('--baseline-commit <ref>', 'Git ref (or tree hash) of a prior run to compare against; enables the regression gate via test_settings.regression_tolerance')
  .action(async (filepath: string, options: { server?: string, skipEval?: boolean, format?: string, threshold?: number, sample?: number, rows?: string, split?: string, seed?: number, truncate?: number, concurrency?: number, baselineCommit?: string }) => {
    try {
      const format = options.format || 'table';
      if (!['table', 'csv', 'json', 'jsonl', 'junit'].includes(format)) {
        throw new Error('Format must be one of: table, csv, json, jsonl, junit');
      }
      const thresholdPercent = typeof options.threshold === 'number' ? options.threshold : undefined;
      await (runExperiment as any)(filepath, {
        skipEval: !!options.skipEval,
        format,
        thresholdPercent,
        server: options.server,
        sample: options.sample,
        rows: options.rows,
        split: options.split,
        seed: options.seed,
        truncate: options.truncate,
        concurrency: options.concurrency,
        baselineCommit: options.baselineCommit,
      });
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
  .option('--base-url <url>', 'Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co)')
  .option('--print-url', 'Print the auth URL instead of opening a browser (for SSH/CI/IDE-embedded contexts)')
  .option('--json', 'Emit a single line of JSON on completion instead of human text')
  .option(
    '--timeout <seconds>',
    'How long the CLI waits for the browser handoff before failing (default: 120 seconds / 2 minutes)',
    (v) => {
      const n = parseInt(v, 10);
      if (!Number.isFinite(n) || n <= 0) {
        throw new Error('--timeout must be a positive integer (seconds)');
      }
      return n;
    },
  )
  .action(async (options: { baseUrl?: string; printUrl?: boolean; json?: boolean; timeout?: number }) => {
    try {
      await (login as any)({ ...options, timeoutSec: options.timeout });
    } catch (error) {
      program.error((error as Error).message);
    }
  });

program
  .command("logout")
  .description('Clear CLI authentication and revoke dev API keys')
  .option('--base-url <url>', 'Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co)')
  .option('--json', 'Emit a single line of JSON on completion instead of human text')
  .action(async (options: { baseUrl?: string; json?: boolean }) => {
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
  .option('--base-url <url>', 'Platform URL (default: $AGENTMARK_PLATFORM_URL or https://app.agentmark.co)')
  .option('--json', 'Emit a single line of JSON on completion (e.g. for CI capture of appId)')
  .action(async (options: { appId?: string; baseUrl?: string; json?: boolean }) => {
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
