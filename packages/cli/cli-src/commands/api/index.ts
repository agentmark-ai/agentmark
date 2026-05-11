import { Command } from 'commander';
import { loadForwardingConfig } from '../../forwarding/config';
import { DEFAULT_API_URL } from '../../auth/constants';
import { format501Error } from './not-available-formatter';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_LOCAL_URL = `http://localhost:${process.env.AGENTMARK_API_PORT || '9418'}`;

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

interface ApiConfig {
  apiKey?: string;
  appId?: string;
  apiUrl: string;
  isLocal: boolean;
}

/**
 * Check if the local dev server is running by hitting its health endpoint.
 */
async function isLocalRunning(): Promise<boolean> {
  try {
    const response = await fetch(`${DEFAULT_LOCAL_URL}/health`, {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Load API config. Target is determined by the --remote flag:
 * - Default (no flag): targets local dev server. Errors if not running.
 * - --remote: targets cloud. Requires login + link.
 */
async function loadConfig(remote: boolean): Promise<ApiConfig> {
  if (!remote) {
    // Local mode: no auth needed, just check the server is running
    const localUp = await isLocalRunning();
    if (!localUp) {
      throw new Error(
        `Local dev server is not running at ${DEFAULT_LOCAL_URL}.\n` +
        'Start it with `agentmark dev`, or use `--remote` to target cloud.',
      );
    }
    return { apiUrl: DEFAULT_LOCAL_URL, isLocal: true };
  }

  // Remote mode: need auth credentials
  const apiKey = process.env.AGENTMARK_API_KEY;
  const appId = process.env.AGENTMARK_APP_ID;
  const apiUrl = process.env.AGENTMARK_API_URL || DEFAULT_API_URL;

  if (apiKey && appId) {
    return { apiKey, appId, apiUrl, isLocal: false };
  }

  try {
    const forwardingConfig = loadForwardingConfig();
    if (!forwardingConfig?.apiKey || !forwardingConfig?.appId) {
      throw new Error(
        'Not configured for remote access. Run `agentmark login` and `agentmark link` first,\n' +
        'or set AGENTMARK_API_KEY and AGENTMARK_APP_ID environment variables.',
      );
    }
    return {
      apiKey: forwardingConfig.apiKey,
      appId: forwardingConfig.appId,
      apiUrl: forwardingConfig.baseUrl || apiUrl,
      isLocal: false,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Not configured')) throw error;
    console.error('[agentmark api] Failed to load forwarding config:', error);
    throw new Error(
      'Not configured for remote access. Run `agentmark login` and `agentmark link` first,\n' +
      'or set AGENTMARK_API_KEY and AGENTMARK_APP_ID environment variables.',
    );
  }
}

// ---------------------------------------------------------------------------
// OpenAPI spec fetching + caching
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(os.homedir(), '.agentmark');
const CACHE_FILE = path.join(CACHE_DIR, 'openapi-cache.json');
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

interface CachedSpec {
  fetchedAt: string;
  apiUrl: string;
  spec: string;
}

function readCachedSpec(apiUrl: string): string | null {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null;
    const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
    const cached: CachedSpec = JSON.parse(raw);

    // Invalidate if the API URL changed or the cache is stale
    if (cached.apiUrl !== apiUrl) return null;
    const age = Date.now() - new Date(cached.fetchedAt).getTime();
    if (age > CACHE_MAX_AGE_MS) return null;

    return cached.spec;
  } catch {
    return null;
  }
}

function writeCachedSpec(apiUrl: string, spec: string): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const cached: CachedSpec = {
      fetchedAt: new Date().toISOString(),
      apiUrl,
      spec,
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cached), 'utf-8');
  } catch {
    // Caching is best-effort -- don't fail the command
  }
}

async function fetchSpecText(apiUrl: string): Promise<string> {
  const specUrl = `${apiUrl}/v1/openapi.json`;
  const response = await fetch(specUrl);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

async function getSpecText(apiUrl: string, forceRefresh: boolean): Promise<string> {
  if (!forceRefresh) {
    const cached = readCachedSpec(apiUrl);
    if (cached) return cached;
  }

  const specText = await fetchSpecText(apiUrl);
  writeCachedSpec(apiUrl, specText);
  return specText;
}

// ---------------------------------------------------------------------------
// specli integration
// ---------------------------------------------------------------------------

type SpecliMainFn = (
  argv: string[],
  options?: { cliName?: string; auth?: string; embeddedSpecText?: string },
) => Promise<void>;

/**
 * Dynamically import specli's internal CLI main function.
 * specli is ESM-only; we use dynamic import() from CJS context.
 * The CLI main lives at specli/dist/cli/main.js relative to the package root.
 */
async function loadSpecliMain(): Promise<SpecliMainFn> {
  // Resolve the specli package entry, then navigate to cli/main.js
  const specliPkgDir = path.dirname(require.resolve('specli/package.json'));
  const cliMainPath = path.join(specliPkgDir, 'dist', 'cli', 'main.js');
  const mod: { main: SpecliMainFn } = await import(cliMainPath);
  return mod.main;
}

// ---------------------------------------------------------------------------
// Specli flag extraction
// ---------------------------------------------------------------------------

/** Flags consumed by our wrapper before passing through to specli. */
const AGENTMARK_BOOL_FLAGS = new Set(['--refresh', '--remote']);

/**
 * Split argv into our wrapper flags and the passthrough args for specli.
 */
function extractWrapperFlags(argv: string[]): {
  boolFlags: Record<string, boolean>;
  passthrough: string[];
} {
  const boolFlags: Record<string, boolean> = {};
  const passthrough: string[] = [argv[0]!, argv[1]!]; // node, script

  let i = 2;
  while (i < argv.length) {
    if (AGENTMARK_BOOL_FLAGS.has(argv[i]!)) {
      const key = argv[i]!.replace(/^--/, '');
      boolFlags[key] = true;
      i++;
    } else {
      passthrough.push(argv[i]!);
      i++;
    }
  }

  return { boolFlags, passthrough };
}

// ---------------------------------------------------------------------------
// Help text
// ---------------------------------------------------------------------------

function printApiHelp(resources: string[]): void {
  const sorted = [...resources].sort();
  console.log(`Usage: agentmark api [options] <resource> <action>

AgentMark API Resources:
${sorted.map((r) => `  ${r}`).join('\n')}

Commands:
  __schema                Show API spec metadata
  <resource> --help       Show actions for a resource
  <resource> <action> --help  Show options for an action

Options:
  --remote                Target cloud (default: local dev server)
  --refresh               Force re-fetch of the OpenAPI spec
  --json                  Output as JSON
  --curl                  Preview curl command without executing
  -h, --help              Show help

Workflow:
  1) agentmark api __schema
  2) agentmark api <resource> --help
  3) agentmark api <resource> <action> --help
  4) agentmark api <resource> <action> [options]`);
}

async function getResources(specText: string): Promise<string[]> {
  const main = await loadSpecliMain();
  const chunks: string[] = [];
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = (chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await main(['node', 'agentmark', '__schema', '--json'], {
      cliName: 'agentmark api',
      auth: 'BearerAuth',
      embeddedSpecText: specText,
    });
  } finally {
    process.stdout.write = origWrite;
  }
  let output: { data?: { resources?: Array<{ name: string }> } };
  try {
    output = JSON.parse(chunks.join(''));
  } catch {
    return [];
  }
  return ((output.data?.resources ?? []) as Array<{ name: string }>).map(
    (r) => r.name,
  );
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function runApi(passthrough: string[], forceRefresh: boolean, remote: boolean): Promise<void> {
  const config = await loadConfig(remote);

  const specText = await getSpecText(config.apiUrl, forceRefresh);

  const target = config.isLocal ? `local (${config.apiUrl})` : `remote (${config.apiUrl})`;
  if (process.env.DEBUG) console.error(`[agentmark api] targeting ${target}`);

  // If no args beyond "api", or just --help / -h, show the resource list
  const args = passthrough.slice(2);
  if (
    args.length === 0 ||
    (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
  ) {
    printApiHelp(await getResources(specText));
    return;
  }

  // Build the argv for specli: inject server and auth flags
  const specliArgv = [...passthrough];
  const inject: string[] = ['--server', config.apiUrl];

  // Only inject auth for remote -- local dev server doesn't require it
  if (!config.isLocal && config.apiKey) {
    inject.push('--bearer-token', config.apiKey);
  }

  specliArgv.splice(2, 0, ...inject);

  const main = await loadSpecliMain();
  await main(specliArgv, {
    cliName: 'agentmark api',
    auth: config.isLocal ? undefined : 'BearerAuth',
    embeddedSpecText: specText,
  });
}

export function registerApiCommand(program: Command): void {
  program
    .command('api', { hidden: false })
    .description('Access the AgentMark public API (auto-generated from OpenAPI spec)')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('--remote', 'Target cloud instead of local dev server')
    .option('--refresh', 'Force re-fetch of the OpenAPI spec')
    .action(async (_opts, cmd: Command) => {
      // Reconstruct the full argv for this subcommand:
      // "agentmark api <rest...>" -> ["node", "agentmark", <rest...>]
      // Commander already parsed "api" off; we need the raw args.
      const rawArgs = process.argv;
      const apiIdx = rawArgs.indexOf('api');
      if (apiIdx === -1) return;

      const apiArgv = [
        rawArgs[0]!, // node
        rawArgs[1]!, // script
        ...rawArgs.slice(apiIdx + 1),
      ];

      const { boolFlags, passthrough } = extractWrapperFlags(apiArgv);
      try {
        await runApi(passthrough, boolFlags['refresh'] ?? false, boolFlags['remote'] ?? false);
      } catch (error) {
        if (error instanceof Error) {
          const formatted = format501Error(error);
          if (formatted) {
            cmd.error(formatted);
          }
          cmd.error(error.message);
        }
        cmd.error(String(error));
      }
    });
}
