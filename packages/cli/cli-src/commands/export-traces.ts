/**
 * CLI Export Traces Command
 *
 * Implements `agentmark export traces` — exports trace data from the
 * gateway API as NDJSON (Generic JSONL, OpenAI chat-completion, or CSV).
 *
 * Flow:
 * 1. Resolve auth: --api-key flag > AGENTMARK_API_KEY env > forwarding config > stored credentials
 * 2. Resolve app ID: --app flag > AGENTMARK_APP_ID env > forwarding config
 * 3. Resolve gateway URL: --base-url > forwarding config baseUrl > DEFAULT_API_URL
 * 4. Build query params from CLI flags
 * 5. If --dry-run, fetch with limit=3 and display summary
 * 6. Stream response to --output file or stdout
 */

import { Command } from "commander";
import fs from "fs-extra";
import {
  loadCredentials,
  isExpired,
} from "../auth/credentials";
import { refreshAccessToken } from "../auth/token-refresh";
import { loadForwardingConfig } from "../forwarding/config";
import {
  DEFAULT_API_URL,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from "../auth/constants";

const EXIT_CODES = {
  SUCCESS: 0,
  AUTH_FAILURE: 1,
  VALIDATION_FAILURE: 2,
  SERVER_ERROR: 5,
} as const;

/**
 * Parses a score filter string like "correctness>=0.8" into query params.
 * Supported operators: >=, >, <=, <, =, !=
 */
function parseScoreFilter(scoreStr: string): { name: string; op: string; value: number } | null {
  // Order matters: check two-char operators before single-char
  const operators = ['>=', '<=', '!=', '>', '<', '='];
  for (const op of operators) {
    const idx = scoreStr.indexOf(op);
    if (idx > 0) {
      const name = scoreStr.slice(0, idx).trim();
      const valueStr = scoreStr.slice(idx + op.length).trim();
      const value = parseFloat(valueStr);
      if (!name || isNaN(value)) return null;
      return { name, op, value };
    }
  }
  return null;
}

/**
 * Resolves authentication, returning the auth headers and appId.
 */
async function resolveAuth(options: {
  apiKey?: string;
  app?: string;
  baseUrl?: string;
}): Promise<{
  headers: Record<string, string>;
  appId: string;
  gatewayUrl: string;
}> {
  const forwardingConfig = loadForwardingConfig();

  // Gateway URL: flag > forwarding config > default
  const gatewayUrl = options.baseUrl || forwardingConfig?.baseUrl || DEFAULT_API_URL;

  // API key path: flag > env > forwarding config
  const apiKey = options.apiKey || process.env.AGENTMARK_API_KEY || forwardingConfig?.apiKey;
  const appId = options.app || process.env.AGENTMARK_APP_ID || forwardingConfig?.appId;

  if (!appId) {
    console.error("No app specified. Run `agentmark link` first or pass --app <id>.");
    process.exit(EXIT_CODES.VALIDATION_FAILURE);
  }

  // If we have an API key, use the API key auth path
  if (apiKey) {
    return {
      headers: {
        'Authorization': apiKey,
        'X-Agentmark-App-Id': appId,
      },
      appId,
      gatewayUrl,
    };
  }

  // Fall back to JWT auth
  let credentials = loadCredentials();
  if (!credentials) {
    console.error("Not logged in. Run `agentmark login` first or pass --api-key.");
    process.exit(EXIT_CODES.AUTH_FAILURE);
  }

  if (isExpired(credentials)) {
    const refreshed = await refreshAccessToken(
      credentials,
      DEFAULT_SUPABASE_URL,
      DEFAULT_SUPABASE_ANON_KEY,
    );
    if (!refreshed) {
      console.error("Token refresh failed. Run `agentmark login` again.");
      process.exit(EXIT_CODES.AUTH_FAILURE);
    }
    credentials = refreshed;
  }

  return {
    headers: {
      'Authorization': `Bearer ${credentials.access_token}`,
    },
    appId,
    gatewayUrl,
  };
}

/**
 * Builds the export URL with query parameters from CLI options.
 */
function buildExportUrl(
  gatewayUrl: string,
  appId: string,
  options: ExportOptions,
  isApiKeyAuth: boolean,
): string {
  const params = new URLSearchParams();

  params.set('format', options.format || 'jsonl');
  params.set('limit', String(options.limit || 500));

  if (options.since) params.set('startDate', options.since);
  if (options.until) params.set('endDate', options.until);
  if (options.type) params.set('type', options.type);
  if (options.model) params.set('model', options.model);
  if (options.status) params.set('status', options.status);
  if (options.name) params.set('name', options.name);
  if (options.userId) params.set('userId', options.userId);
  if (options.tag) params.set('tag', options.tag);
  if (options.lightweight) params.set('lightweight', 'true');

  // JWT auth requires appId as query param (no X-Agentmark-App-Id header)
  if (!isApiKeyAuth) {
    params.set('appId', appId);
  }

  // Parse score filters into minScore/maxScore params
  if (options.score) {
    const scores = Array.isArray(options.score) ? options.score : [options.score];
    for (const scoreStr of scores) {
      const parsed = parseScoreFilter(scoreStr);
      if (!parsed) {
        console.error(`Invalid score filter: "${scoreStr}". Expected format: name>=value`);
        process.exit(EXIT_CODES.VALIDATION_FAILURE);
      }
      // Map to minScore/maxScore query params
      if (parsed.op === '>=' || parsed.op === '>') {
        params.set('minScore', String(parsed.value));
      } else if (parsed.op === '<=' || parsed.op === '<') {
        params.set('maxScore', String(parsed.value));
      }
    }
  }

  return `${gatewayUrl}/v1/traces/export?${params.toString()}`;
}

interface ExportOptions {
  format?: string;
  app?: string;
  score?: string[];
  since?: string;
  until?: string;
  limit?: number;
  dryRun?: boolean;
  output?: string;
  apiKey?: string;
  baseUrl?: string;
  type?: string;
  model?: string;
  status?: string;
  name?: string;
  userId?: string;
  tag?: string;
  lightweight?: boolean;
}

/**
 * Factory function that creates the `agentmark export traces` commander command.
 */
export default function createExportCommand(): Command {
  const exportCmd = new Command("export");

  const tracesCmd = new Command("traces")
    .description("Export trace data as JSONL, OpenAI chat-completion format, or CSV")
    .option("--format <format>", "Export format: jsonl, openai, or csv (default: jsonl)")
    .option("--app <id>", "App ID to export from (uses linked app if omitted)")
    .option("--score <filter>", "Score filter, e.g. \"correctness>=0.8\" (repeatable)", collect, [])
    .option("--since <date>", "Start date (ISO 8601, e.g. 2026-03-01)")
    .option("--until <date>", "End date (ISO 8601, default: now)")
    .option("--limit <number>", "Max rows to export (default: 500, max: 2000)", parseIntOption)
    .option("--dry-run", "Preview matching trace count and sample without exporting")
    .option("-o, --output <path>", "Output file path (default: stdout)")
    .option("--api-key <key>", "API key (overrides env var and stored credentials)")
    .option("--base-url <url>", "Gateway URL override")
    .option("--type <type>", "Span type filter: GENERATION, SPAN, EVENT, or all")
    .option("--model <name>", "Filter by model name (exact match)")
    .option("--status <code>", "Filter by status: STATUS_CODE_OK, STATUS_CODE_ERROR")
    .option("--name <pattern>", "Filter by span name (partial match)")
    .option("--user-id <id>", "Filter by user ID")
    .option("--tag <value>", "Filter by tag")
    .option("--lightweight", "Exclude large I/O fields (Input, Output, ToolCalls)")
    .action(async (options: ExportOptions) => {
      try {
        await runExportTraces(options);
      } catch (error) {
        const exitCode = (error as ExportError).exitCode ?? EXIT_CODES.SERVER_ERROR;
        console.error((error as Error).message || 'Export failed');
        process.exit(exitCode);
      }
    });

  exportCmd.addCommand(tracesCmd);
  return exportCmd;
}

/** Commander helper: collect repeatable options into an array */
function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/** Commander helper: parse integer option */
function parseIntOption(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error("Limit must be a positive integer");
  }
  return n;
}

async function runExportTraces(options: ExportOptions): Promise<void> {
  // Validate format
  const validFormats = ['jsonl', 'openai', 'csv'];
  if (options.format && !validFormats.includes(options.format)) {
    console.error(`Invalid format "${options.format}". Must be one of: ${validFormats.join(', ')}`);
    process.exit(EXIT_CODES.VALIDATION_FAILURE);
  }

  // Validate limit
  if (options.limit !== undefined && (options.limit < 1 || options.limit > 2000)) {
    console.error("Limit must be between 1 and 2000.");
    process.exit(EXIT_CODES.VALIDATION_FAILURE);
  }

  // Resolve auth
  const { headers, appId, gatewayUrl } = await resolveAuth(options);
  const isApiKeyAuth = !headers['Authorization']?.startsWith('Bearer ');

  // Dry run: fetch a small sample
  if (options.dryRun) {
    const dryRunOptions = { ...options, limit: 3 };
    const url = buildExportUrl(gatewayUrl, appId, dryRunOptions, isApiKeyAuth);

    const response = await fetch(url, { headers });
    if (!response.ok) {
      await handleErrorResponse(response);
      return;
    }

    const body = await response.text();
    const lines = body.split('\n').filter(Boolean);

    // Find the metadata line
    let meta: { total?: number; exported?: number; skipped?: number } = {};
    let sampleLines: string[] = [];
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed._export_meta) {
          meta = parsed._export_meta;
        } else {
          sampleLines.push(line);
        }
      } catch {
        sampleLines.push(line);
      }
    }

    console.error(`\nDry run — preview of export from app ${appId}\n`);
    console.error(`Filters applied:`);
    console.error(`  Format: ${options.format || 'jsonl'}`);
    if (options.since) console.error(`  Since: ${options.since}`);
    if (options.until) console.error(`  Until: ${options.until}`);
    if (options.score?.length) console.error(`  Score: ${options.score.join(', ')}`);
    if (options.model) console.error(`  Model: ${options.model}`);
    if (options.type) console.error(`  Type: ${options.type}`);
    if (options.status) console.error(`  Status: ${options.status}`);
    if (options.name) console.error(`  Name: ${options.name}`);
    if (options.userId) console.error(`  User ID: ${options.userId}`);
    if (options.tag) console.error(`  Tag: ${options.tag}`);

    console.error(`\nMatching traces: ${meta.exported ?? sampleLines.length}`);
    if ((meta.skipped ?? 0) > 0) {
      console.error(`Skipped (unconvertible): ${meta.skipped}`);
    }

    if (sampleLines.length > 0) {
      console.error(`\nSample (${sampleLines.length} row${sampleLines.length === 1 ? '' : 's'}):\n`);
      for (const line of sampleLines) {
        console.error(line);
      }
    } else {
      console.error(`\nNo matching traces found.`);
    }

    console.error('');
    process.exit(EXIT_CODES.SUCCESS);
    return;
  }

  // Full export
  const url = buildExportUrl(gatewayUrl, appId, options, isApiKeyAuth);
  const response = await fetch(url, { headers });

  if (!response.ok) {
    handleErrorResponse(response);
    return;
  }

  // If --output specified, write to file
  if (options.output) {
    // Check if file exists and TTY is interactive
    if (fs.existsSync(options.output) && process.stdin.isTTY) {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
      const answer = await new Promise<string>((resolve) => {
        rl.question(`File "${options.output}" already exists. Overwrite? [y/N] `, resolve);
      });
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.error("Export cancelled.");
        process.exit(EXIT_CODES.SUCCESS);
        return;
      }
    } else if (fs.existsSync(options.output) && !process.stdin.isTTY) {
      console.error(`File "${options.output}" already exists. Use interactive mode or delete it first.`);
      process.exit(EXIT_CODES.VALIDATION_FAILURE);
      return;
    }

    const body = await response.text();
    const lines = body.split('\n').filter(Boolean);

    // Separate data lines from metadata trailer
    const dataLines: string[] = [];
    let exportedCount = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed._export_meta) {
          exportedCount = parsed._export_meta.exported ?? 0;
          continue;
        }
      } catch {
        // Not JSON (e.g. CSV lines) — include as-is
      }
      dataLines.push(line);
    }

    await fs.writeFile(options.output, dataLines.join('\n') + (dataLines.length > 0 ? '\n' : ''));
    const count = exportedCount || dataLines.length;
    console.error(`Exported ${count} row${count === 1 ? '' : 's'} to ${options.output}`);
    process.exit(EXIT_CODES.SUCCESS);
    return;
  }

  // No --output: stream to stdout, status to stderr
  const body = await response.text();
  const lines = body.split('\n').filter(Boolean);

  let exportedCount = 0;
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed._export_meta) {
        exportedCount = parsed._export_meta.exported ?? 0;
        continue;
      }
    } catch {
      // Not JSON metadata — pass through
    }
    process.stdout.write(line + '\n');
  }

  console.error(`Exported ${exportedCount || lines.length} rows.`);
  process.exit(EXIT_CODES.SUCCESS);
}

export class ExportError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message);
  }
}

export { parseScoreFilter };

async function handleErrorResponse(response: Response): Promise<never> {
  const status = response.status;
  let message: string;

  try {
    const body = await response.json() as { error?: string; message?: string };
    message = body.error || body.message || `HTTP ${status}`;
  } catch {
    message = `HTTP ${status}`;
  }

  switch (status) {
    case 400:
      throw new ExportError(`Validation error: ${message}`, EXIT_CODES.VALIDATION_FAILURE);
    case 401:
      throw new ExportError(`Authentication failed: ${message}\nRun \`agentmark login\` or check your --api-key.`, EXIT_CODES.AUTH_FAILURE);
    case 403:
      throw new ExportError(`Access denied: ${message}`, EXIT_CODES.AUTH_FAILURE);
    case 429:
      throw new ExportError(`Rate limited. Try again later.`, EXIT_CODES.SERVER_ERROR);
    default:
      throw new ExportError(`Export failed: ${message}`, EXIT_CODES.SERVER_ERROR);
  }
}
