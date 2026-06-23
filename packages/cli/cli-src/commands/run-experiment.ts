import path from "path";
import fs from "fs";
import type { Root } from "mdast";
import { pathToFileURL } from "url";
import { detectPromptTypeFromContent } from "../utils/prompt-detection.js";
import { buildJUnitReport, type JUnitRow } from "../utils/junit-formatter.js";
import { evaluateExperimentGate, baselineRequestQuery, parseBaselineResponse, type GateRow, type BaselineResolved } from "@agentmark-ai/prompt-core";
import { readTestSettings } from "../utils/test-settings.js";
import { loadLocalConfig, promptPathFromAgentmarkRoot } from "../config.js";
import { getApiUrl } from "../auth/constants.js";

/**
 * Loads an AST from either a pre-built JSON file or an MDX file.
 * @param resolvedFilepath - Absolute path to the file
 * @returns The AST, prompt name, and dataset path (if available)
 */
async function loadAst(resolvedFilepath: string): Promise<{ ast: Root; promptName?: string; datasetPath?: string }> {
  if (resolvedFilepath.endsWith('.json')) {
    // Load pre-built AST from JSON file
    const content = fs.readFileSync(resolvedFilepath, 'utf-8');
    const built = JSON.parse(content);

    if (!built.ast) {
      throw new Error('Invalid pre-built prompt file: missing "ast" field');
    }

    // Extract dataset path from the AST's frontmatter
    let datasetPath: string | undefined;
    try {
      const yamlNode: any = (built.ast as any)?.children?.find((n: any) => n?.type === 'yaml');
      if (yamlNode) {
        const { parse: parseYaml } = await import('yaml');
        datasetPath = parseYaml(yamlNode.value)?.test_settings?.dataset;
      }
    } catch {
      // Ignore errors when parsing dataset path
    }

    return {
      ast: built.ast as Root,
      promptName: built.metadata?.name,
      datasetPath
    };
  } else if (resolvedFilepath.endsWith('.mdx')) {
    // Parse MDX file using prompt-core's TemplateDX instances (which have tags registered)
    const { getTemplateDXInstance } = await import("@agentmark-ai/prompt-core");

    // Read content to detect prompt type
    const content = fs.readFileSync(resolvedFilepath, 'utf-8');
    const parserType = detectPromptTypeFromContent(content);

    // Get the appropriate TemplateDX instance with AgentMark tags registered
    const templateDX = getTemplateDXInstance(parserType);

    // Create content loader for resolving imports
    const baseDir = path.dirname(resolvedFilepath);
    const contentLoader = async (filePath: string) => {
      const { readFile } = await import('fs/promises');
      const resolvedPath = path.resolve(baseDir, filePath);
      return readFile(resolvedPath, 'utf-8');
    };

    // Parse the MDX content
    const ast: Root = await templateDX.parse(content, baseDir, contentLoader);
    const frontmatter = templateDX.getFrontMatter(ast) as { name?: string };

    // Extract dataset path from frontmatter
    let datasetPath: string | undefined;
    try {
      const yamlNode: any = (ast as any)?.children?.find((n: any) => n?.type === 'yaml');
      if (yamlNode) {
        const { parse: parseYaml } = await import('yaml');
        datasetPath = parseYaml(yamlNode.value)?.test_settings?.dataset;
      }
    } catch {
      // Ignore errors when parsing dataset path
    }

    return {
      ast,
      promptName: frontmatter.name,
      datasetPath
    };
  } else {
    throw new Error('File must be an .mdx or .json file');
  }
}

// Lazy-load cli-table3 so other commands (e.g., serve) don't pull ESM deps
let _Table: any;
async function getTable() {
  if (_Table) return _Table;
  const mod = await import('cli-table3');
  _Table = (mod as any).default || (mod as any);
  return _Table;
}


const getTerminalWidth = (): number => {
  const cols = process.stdout.columns;
  return typeof cols === 'number' && cols > 0 ? cols : 120;
};

type LayoutResult = { head: string[]; colWidths: number[]; };

const computeLayout = (baseHead: string[], evalNames: string[] = [], _sampleRows: string[][] = []): LayoutResult => {
  const head = [...baseHead, ...evalNames];
  const terminalWidth = getTerminalWidth();
  const overhead = (head.length + 1) * 3;
  const available = terminalWidth - overhead;

  // Set absolute minimums based on column type (bare minimum for readability)
  const absoluteMins = head.map((h, idx) => {
    if (idx === 0) return 3; // # column
    if (h === 'Input' || h === 'AI Result' || h === 'Expected Output') return 20; // Data columns
    return 15; // Eval columns
  });

  // Define weights for space distribution
  const weights = head.map((h, idx) => {
    if (idx === 0) return 1;
    if (h === 'AI Result') return 8;
    if (h === 'Input' || h === 'Expected Output') return 6;
    return 2; // Eval columns
  });

  // Calculate total weight and minimum space needed
  const sumAbsoluteMins = absoluteMins.reduce((a, b) => a + b, 0);

  // If we don't have enough space for even the minimums, scale everything down proportionally
  if (available <= sumAbsoluteMins) {
    const scaleFactor = available / sumAbsoluteMins;
    return {
      head,
      colWidths: absoluteMins.map((min, idx) => Math.max(
        idx === 0 ? 3 : 10, // Never go below 3 for #, 10 for others
        Math.floor(min * scaleFactor)
      ))
    };
  }

  // We have space - distribute it proportionally based on weights
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((weight, idx) => {
    const proportionalWidth = Math.floor((available * weight) / weightSum);
    return Math.max(absoluteMins[idx], proportionalWidth);
  });

  // Adjust for rounding errors
  const diff = available - widths.reduce((a, b) => a + b, 0);
  if (diff !== 0) {
    widths[widths.length - 1] += diff;
  }

  return { head, colWidths: widths };
};

/**
 * Resolves a path against the current working directory or PWD environment variable.
 * @param inputPath - The path to resolve
 * @returns Resolved absolute path
 * @throws Error if the working directory is invalid and the path is relative
 */
function resolveAgainstCwdOrEnv(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  let base: string | undefined;
  try { base = process.cwd(); } catch { base = process.env.PWD; }
  if (!base) {
    throw new Error(
      'Invalid working directory. Unable to resolve relative path.\n' +
      'Please provide an absolute path or ensure PWD environment variable is set.'
    );
  }
  return path.resolve(base, inputPath);
}

// Format helper functions
function escapeCSV(value: string): string {
  // Escape double quotes and wrap in quotes if contains comma, newline, or quote
  if (value.includes(',') || value.includes('\n') || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}


interface ExperimentConfig {
  outputDir: string;
}

function getExperimentConfig(): ExperimentConfig {
  return {
    outputDir: '.agentmark-outputs',
  };
}

/**
 * Fire-and-forget POST of eval scores to the API server.
 * Extracted so the logic is testable without spinning up the full experiment runner.
 */
export function postExperimentScores(
  evt: { traceId?: string; result?: { evals?: Array<{ name: string; score?: number; label?: string; reason?: string; passed?: boolean; dataType?: string }> } },
  apiServerUrl: string,
): void {
  const evals = evt.result?.evals;
  if (!evt.traceId || !Array.isArray(evals) || evals.length === 0) return;
  for (const evalResult of evals) {
    // Schema-aware path: runner already produced canonical score/label via toStoredScore
    // Legacy path: derive score/label from passed/score fields
    const hasCanonicalFormat = evalResult.dataType && typeof evalResult.score === 'number' && typeof evalResult.label === 'string';

    let score: number;
    let label: string;

    if (hasCanonicalFormat) {
      score = evalResult.score!;
      label = evalResult.label!;
    } else if (typeof evalResult.score === 'number' || evalResult.passed !== undefined) {
      const passed = evalResult.passed;
      label = evalResult.label ?? (passed !== undefined ? (passed ? 'PASS' : 'FAIL') : 'N/A');
      score = evalResult.score ?? (passed !== undefined ? (passed ? 1 : 0) : 0);
    } else {
      continue;
    }

    fetch(`${apiServerUrl}/v1/scores`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // CreateScoreBodySchema in @agentmark-ai/api-schemas (scores.ts:18)
      // requires snake_case keys. Zod silently strips unknown camelCase
      // fields, so a body with `resourceId`/`dataType` ends up missing
      // the required `resource_id` and the POST stores nothing.
      body: JSON.stringify({
        resource_id: evt.traceId,
        score,
        label,
        reason: evalResult.reason || '',
        name: evalResult.name,
        type: 'experiment',
        // These scores come from an experiment run, not a direct API call —
        // stamp the Source accordingly (the API would otherwise default to 'api').
        source: 'experiment',
        data_type: evalResult.dataType || '',
      }),
    }).catch(() => {}); // fire-and-forget — never block experiment rendering
  }
}

/**
 * Resolve the API base + headers for the baseline-scores lookup.
 *
 * Cloud (when an API key is present via `AGENTMARK_API_KEY` or a linked
 * project): the gateway base URL with the api-key in `Authorization` and the
 * app id in `X-Agentmark-App-Id` — the same convention the trace forwarder
 * uses. Otherwise the local `agentmark dev` API server, which serves the
 * identical `/v1/experiments/baseline` route from SQLite.
 */
function resolveBaselineApi(): { baseUrl: string; headers: Record<string, string> } {
  const cfg = loadLocalConfig().forwarding;
  const apiKey = process.env.AGENTMARK_API_KEY || cfg?.apiKey;
  if (apiKey) {
    const baseUrl = (cfg?.baseUrl || getApiUrl()).replace(/\/+$/, '');
    const headers: Record<string, string> = { Authorization: apiKey };
    const appId = process.env.AGENTMARK_APP_ID || cfg?.appId;
    if (appId) headers['X-Agentmark-App-Id'] = appId;
    return { baseUrl, headers };
  }
  return {
    baseUrl: `http://localhost:${process.env.AGENTMARK_API_PORT || '9418'}`,
    headers: {},
  };
}

/**
 * Fetch baseline scores for a prior run via the shared baseline protocol
 * (`baselineRequestQuery` + `parseBaselineResponse` from prompt-core — the same
 * the SDK uses, so the gate's input can't drift between entry points). This
 * wrapper owns only the CLI's transport (`resolveBaselineApi`) and its
 * degrade-on-failure semantics: a missing/unreachable baseline yields an empty
 * map rather than hard-failing CI.
 *
 * Returns `{ map, resolved, error }`. `error` is set for a transport/auth/parse
 * failure (HTTP non-2xx or a thrown fetch) and is left undefined for a
 * successful-but-empty baseline — so the caller can tell a misconfigured key or
 * unreachable endpoint from a genuinely absent baseline, instead of silently
 * disabling the gate on both with the same "no baseline" message.
 */
export async function fetchBaselineScores(args: {
  experimentKey: string;
  datasetPath?: string;
  treeHash: string;
}): Promise<{ map: Map<string, number>; resolved: BaselineResolved | null; error?: string }> {
  try {
    const { baseUrl, headers } = resolveBaselineApi();
    const res = await fetch(
      `${baseUrl}/v1/experiments/baseline?${baselineRequestQuery(args)}`,
      { method: 'GET', headers },
    );
    if (!res.ok) {
      const auth = res.status === 401 || res.status === 403;
      return {
        map: new Map(),
        resolved: null,
        error: auth ? `HTTP ${res.status} — check AGENTMARK_API_KEY` : `HTTP ${res.status}`,
      };
    }
    const { resolved, baseline } = parseBaselineResponse(await res.json());
    return { map: baseline, resolved };
  } catch (e) {
    // Network/parse failure — proceed with no baseline, but flag it as an error
    // (unreachable endpoint) so the caller doesn't report it as "no baseline".
    return { map: new Map(), resolved: null, error: `unreachable — ${(e as Error)?.message || 'fetch failed'}` };
  }
}

/**
 * Resolve a git ref (branch, commit, or tree hash) to its **tree hash**, which
 * is what runs are tagged with (`commit_sha` is content-addressed). Resolving
 * `<ref>^{tree}` is idempotent for an already-resolved tree hash. Falls back to
 * the raw value if git isn't available.
 */
async function resolveTreeHash(ref: string, cwd: string): Promise<string> {
  try {
    const { execFileSync } = await import('child_process');
    return execFileSync('git', ['rev-parse', `${ref}^{tree}`], {
      encoding: 'utf-8',
      timeout: 5000,
      cwd,
    }).trim();
  } catch {
    return ref;
  }
}

/**
 * Derive the experiment identity (the regression gate's stable matching key)
 * from the entrypoint, as a repo-relative path normalized to forward slashes
 * with a leading `./` — stable regardless of where the CLI is invoked, and
 * distinct per entrypoint so two evals sharing a dataset don't collide. Falls
 * back to the prompt name / basename when git isn't available. Callers prefer
 * an explicit `test_settings.experiment_key` over this default.
 */
async function deriveExperimentKey(resolvedFilepath: string, promptName?: string): Promise<string> {
  try {
    const { execFileSync } = await import('child_process');
    const toplevel = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: path.dirname(resolvedFilepath),
    }).trim();
    const rel = path.relative(toplevel, resolvedFilepath).split(path.sep).join('/');
    if (rel && !rel.startsWith('..')) return `./${rel}`;
  } catch {
    // git unavailable / not a repo — fall through to a best-effort identity.
  }
  return promptName || path.basename(resolvedFilepath);
}

export default async function runExperiment(filepath: string, options: { skipEval?: boolean; format?: string; thresholdPercent?: number; server?: string; saveOutput?: string; sample?: number; rows?: string; split?: string; seed?: number; truncate?: number; concurrency?: number; baselineCommit?: string }) {
  const evalEnabled = !options.skipEval;
  const format = options.format || 'table';
  const truncateLimit = options.truncate === 0 ? Infinity : (options.truncate ?? 1000);
  const config = getExperimentConfig();

  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);
  // Folder-aware prompt path RELATIVE TO THE AGENTMARK ROOT (the key prompts are
  // searched by — parent_path + name), forward-slashed for the span's
  // `agentmark.prompt_path`. The agentmark dir is user-configurable
  // (agentmark.json `agentmarkPath`), so resolve it from config rather than
  // assuming `<cwd>/agentmark`.
  const promptPathRel = promptPathFromAgentmarkRoot(resolvedFilepath);
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(
      `Prompt file not found: ${resolvedFilepath}\n` +
      `Please check that the file exists and the path is correct.`
    );
  }

  if (!resolvedFilepath.endsWith('.mdx') && !resolvedFilepath.endsWith('.json')) {
    throw new Error('File must be an .mdx or .json file');
  }

  // Ensure runner client resolves prompt-relative resources (datasets, etc.)
  try { process.env.AGENTMARK_ROOT = path.dirname(resolvedFilepath); } catch {
    // Ignore errors when setting environment variable
  }
  // If current cwd is invalid, switch to the prompt's directory to stabilize deps that use process.cwd()
  try { process.chdir(path.dirname(resolvedFilepath)); } catch {
    // Ignore errors when changing directory
  }

  // Load AST from MDX or pre-built JSON file
  const { ast, promptName, datasetPath } = await loadAst(resolvedFilepath);

  // Determine prompt type from frontmatter (Text/Object/Image/Speech)
  let promptType: 'Text' | 'Object' | 'Image' | 'Speech' = 'Text';
  try {
    const yamlNode: any = (ast as any)?.children?.find((n: any) => n?.type === 'yaml');
    if (yamlNode && typeof yamlNode.value === 'string') {
      const { parse: parseYaml } = await import('yaml');
      const fm = parseYaml(yamlNode.value) || {};
      // Determine prompt type
      if (fm.object_config) promptType = 'Object';
      else if (fm.image_config) promptType = 'Image';
      else if (fm.speech_config) promptType = 'Speech';
      else promptType = 'Text';
    }
  } catch {
    // Ignore errors when parsing prompt type
  }

  const server = options.server || process.env.AGENTMARK_WEBHOOK_URL || 'http://localhost:9417';
  if (!server || !/^https?:\/\//i.test(server)) {
    throw new Error(
      'Invalid or missing server URL.\n' +
      'Please ensure the AgentMark dev server is running with: npx @agentmark-ai/cli dev\n' +
      `Expected format: http://localhost:9417 (got: ${server || 'undefined'})`
    );
  }

  // Build sampling options from CLI flags
  let sampling: Record<string, unknown> | undefined = undefined;
  if (options.sample !== undefined || options.rows !== undefined || options.split !== undefined) {
    const { parseRowSelection, parseSplitSpec, validateSamplingOptions } = await import('@agentmark-ai/prompt-core');
    const opts: { sample?: number; rows?: number[]; split?: { portion: 'train' | 'test'; percentage: number }; seed?: number } = {};
    if (options.sample !== undefined) opts.sample = options.sample;
    if (options.rows !== undefined) opts.rows = parseRowSelection(options.rows);
    if (options.split !== undefined) opts.split = parseSplitSpec(options.split);
    if (options.seed !== undefined) opts.seed = options.seed;
    validateSamplingOptions(opts);
    sampling = opts;
  } else if (options.seed !== undefined) {
    sampling = { seed: options.seed };
  }

  // Capture git state for experiment traceability using tree hashes.
  // Tree hashes are content-addressed: identical file state = identical hash,
  // unlike commit/stash hashes which include timestamps and differ every run.
  // Uses explicit cwd to ensure git runs in the correct repo, regardless of
  // any process.chdir() that may have changed the working directory.
  let commitSha: string | undefined;
  try {
    const { execFileSync } = await import('child_process');
    const gitCwd = path.dirname(resolvedFilepath);
    const gitExec = (args: string[]) =>
      execFileSync('git', args, { encoding: 'utf-8', timeout: 5000, cwd: gitCwd }).trim();
    const stash = gitExec(['stash', 'create']);
    if (stash) {
      // Dirty working tree: use tree hash from the stash snapshot
      commitSha = gitExec(['rev-parse', `${stash}^{tree}`]);
    } else {
      // Clean working tree: use HEAD's tree hash
      commitSha = gitExec(['rev-parse', 'HEAD^{tree}']);
    }
  } catch {
    // Not a git repo or git not available — skip
  }

  // Read test_settings up front — needed for the experiment identity (below)
  // and the regression tolerance, which is evaluated inline as the run streams
  // so the gate fires for every output format, not only --format junit.
  // Validated against the canonical TestSettingsSchema; typos / out-of-range
  // values yield `undefined` rather than silent behaviour.
  const testSettings = await readTestSettings(ast);
  const regressionTolerance = testSettings?.regression_tolerance;

  // Experiment identity: explicit `test_settings.experiment_key`, else the
  // repo-relative entrypoint path. Stable across commits and composition-
  // agnostic (prompt/workflow/agent), so two evals sharing a dataset don't
  // collide. Tagged on this run's spans (via the dataset-run body → runner →
  // span) and used as the baseline-lookup key. `sourceTreeHash` (commitSha) is
  // the run's code state; together they resolve the baseline.
  const experimentKey = testSettings?.experiment_key || await deriveExperimentKey(resolvedFilepath, promptName);

  // Resolve the baseline run (if requested) and fetch its per-(row × scorer)
  // scores. Keyed by hashRowInput so live rows match regardless of order.
  // hashRowInput is loaded lazily (only when a baseline is in play) to keep
  // prompt-core off the CLI's startup path.
  let baselineMap = new Map<string, number>();
  let baselineCommitSha: string | undefined;
  let hashRowInput: ((input: unknown) => string) | undefined;
  if (evalEnabled && options.baselineCommit) {
    baselineCommitSha = await resolveTreeHash(options.baselineCommit, path.dirname(resolvedFilepath));
    const baseline = await fetchBaselineScores({ experimentKey, datasetPath, treeHash: baselineCommitSha });
    baselineMap = baseline.map;
    if (baselineMap.size > 0) {
      ({ hashRowInput } = await import("@agentmark-ai/prompt-core"));
      if (baseline.resolved && !baseline.resolved.matchedExactCommit) {
        // No run at the exact base tree hash — fell back to the most recent
        // prior run of this experiment_key. Surface it on stderr (stdout stays
        // clean for `> results.xml` / csv).
        console.error(`⚠️  No run at ${baselineCommitSha} for "${experimentKey}"; comparing against the most recent prior run instead.`);
      }
    } else if (baseline.error) {
      console.error(`⚠️  Could not fetch baseline for "${experimentKey}" (${baseline.error}) — regression gate inactive.`);
    } else {
      console.error(`⚠️  No baseline run found for "${experimentKey}" — regression gate inactive.`);
    }
  }

  // Only show status messages for table format
  if (format === 'table') {
    console.log("Running prompt with dataset...");
    if (evalEnabled) console.log("🧪 Evaluations enabled");
  }

  const body = JSON.stringify({ type: 'dataset-run', data: { ast, promptPath: promptPathRel, datasetPath, experimentId: promptName, ...(experimentKey ? { experimentKey } : {}), ...(sampling ? { sampling } : {}), ...(commitSha ? { sourceTreeHash: commitSha } : {}), ...(options.concurrency !== undefined ? { concurrency: options.concurrency } : {}) } });

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  let res;
  try {
    res = await fetch(server, {
      method: 'POST',
      headers,
      body
    });
  } catch (fetchError: any) {
    // Network-level errors (server not running, connection refused, etc.)
    const isConnectionError =
      fetchError.message?.includes('ECONNREFUSED') ||
      fetchError.message?.includes('fetch failed') ||
      fetchError.cause?.code === 'ECONNREFUSED';

    if (isConnectionError) {
      throw new Error(
        `❌ Could not connect to AgentMark server at ${server}\n\n` +
        `The server is not running or not reachable.\n\n` +
        `To start the server, run:\n` +
        `  npx @agentmark-ai/cli dev\n\n` +
        `Or specify a different server URL with:\n` +
        `  agentmark run-experiment <filepath> --server <url>`
      );
    }
    // Re-throw other network errors with context
    throw new Error(`Network error connecting to ${server}: ${fetchError.message}`);
  }

  if (!res.ok) {
    let raw = '';
    try { raw = await res.text(); } catch {
      // Ignore errors when reading response text
    }
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {
      // Ignore errors when parsing JSON
    }
    const ct = res.headers.get('content-type') || '';
    const statusLine = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
    const errMsg = parsed?.error || parsed?.message || raw?.slice?.(0, 2000) || 'Unknown error';

    // Provide more helpful error messages based on status code
    let helpText = '';
    if (res.status === 404) {
      helpText = '\n\nTip: The dev server endpoint was not found. Make sure you are running the latest version.';
    } else if (res.status === 400) {
      helpText = '\n\nTip: The request was malformed. Check that your prompt file and dataset are valid.';
    } else if (res.status === 500) {
      helpText = '\n\nTip: The server encountered an error. Check the dev server logs for more details.';
    } else if (res.status === 503 || res.status === 502) {
      helpText = '\n\nTip: The server is unavailable. Make sure the dev server is running with: npx @agentmark-ai/cli dev';
    }

    const details = `HTTP ${statusLine} — Content-Type: ${ct}`;
    const msg = `Runner request failed. ${details}\nURL: ${server}\nError: ${errMsg}${helpText}`;
    console.error(msg);
    throw new Error(msg);
  }
  const stream = res.body!;

  let index = 1;
  let totalEvals = 0; let passedEvals = 0;
  // Lightweight per-row eval data buffered for the regression gate, which runs
  // once at the end via the shared `evaluateExperimentGate` primitive — the same
  // gate the SDK uses, so the two entry points never drift. Buffering (rather
  // than the prior inline tally) keeps the gate format-independent and lets one
  // primitive own both the regression and score_threshold predicates.
  const gateRows: GateRow[] = [];
  let evalNames: string[] = [];
  let tableInitialized = false;
  let Table: any;
  let table: any;
  const jsonRows: any[] = []; // For buffering JSON format output
  const junitRows: JUnitRow[] = []; // For buffering JUnit XML format output
  let experimentRunId: string | undefined; // Capture run ID for linking to all traces

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = '';

  // Stream and render rows as they arrive
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (typeof value === 'string') buffered += value; else buffered += decoder.decode(value as any, { stream: true });
      let idx;
      while ((idx = buffered.indexOf('\n')) !== -1) {
        const line = buffered.slice(0, idx); buffered = buffered.slice(idx + 1);
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === 'error' && evt.error) {
            const errorMsg = typeof evt.error === 'string'
              ? evt.error
              : (evt.error.message || JSON.stringify(evt.error, null, 2));
            console.error(`❌ ${errorMsg}`);
            continue;
          }
          if (evt.type !== 'dataset') continue;
          const r = evt.result || {};
          if (evt.runId && !experimentRunId) experimentRunId = evt.runId;
          const truncate = (s: string) => format === 'table' && s.length > truncateLimit ? s.slice(0, truncateLimit) + '…' : s;
          const input = truncate(JSON.stringify(r.input ?? {}, null, 0));
          const rawExpected = r.expectedOutput ?? 'N/A';
          const expected = typeof rawExpected === 'object' && rawExpected !== null
            ? JSON.stringify(rawExpected, null, 0)
            : String(rawExpected);

          // Coerce AI result column, saving media to files and printing IDE-clickable paths
          let actual: string;
          const extraPaths: Array<{ rel: string; kind: 'image' | 'audio' } > = [];
          const hyperlink = (label: string, url: string) => `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
          const outDir = path.join(process.cwd(), config.outputDir);
          const ensureOutDir = () => { try { fs.mkdirSync(outDir, { recursive: true }); } catch {
            // Ignore errors when creating output directory
          } };
          const ao = r.actualOutput;
          if (Array.isArray(ao) && ao.length > 0 && ao.every((x: any) => x && typeof x.base64 === 'string')) {
            // Image array output
            ensureOutDir();
            const timestamp = Date.now();
            const linkLabels: string[] = [];
            ao.forEach((img: any, idx: number) => {
              const ext = (img.mimeType?.split?.('/')?.[1]) || 'png';
              const filePath = path.join(outDir, `image-${index}-${idx + 1}-${timestamp}.${ext}`);
              try { fs.writeFileSync(filePath, Buffer.from(img.base64, 'base64')); } catch {
                // Ignore errors when writing image file
              }
              extraPaths.push({ rel: filePath, kind: 'image' });
              const url = pathToFileURL(filePath).href;
              linkLabels.push(hyperlink(`View Image ${idx + 1}`, url));
            });
            if (linkLabels.length) {
              actual = linkLabels.join(', ');
            } else {
              actual = '(no content)';
            }
          } else if (ao && typeof ao === 'object' && typeof ao.base64 === 'string') {
            // Audio object output
            ensureOutDir();
            const timestamp = Date.now();
            const ext = ao.format || (ao.mimeType?.split?.('/')?.[1] || 'mp3');
            const filePath = path.join(outDir, `audio-${index}-${timestamp}.${ext}`);
            try { fs.writeFileSync(filePath, Buffer.from(ao.base64, 'base64')); } catch {
              // Ignore errors when writing audio file
            }
            const url = pathToFileURL(filePath).href;
            actual = hyperlink('Play Audio', url);
            extraPaths.push({ rel: filePath, kind: 'audio' });
          } else {
            actual = typeof ao === 'string' ? ao : JSON.stringify(ao ?? '');
          }
          const evals = Array.isArray(r.evals) ? r.evals : [];

          // Input-hash join key for baseline matching — computed once per row,
          // only when a baseline is in play (skips the hash cost otherwise).
          // Reused by both the regression gate and the JUnit buffer below.
          const rowInputHash = hashRowInput ? hashRowInput(r.input) : undefined;

          // Buffer this row's eval scores for the shared regression gate, which
          // runs once after streaming (evaluateExperimentGate). Format-independent.
          gateRows.push({
            inputHash: rowInputHash,
            evals: evals.map((e: any) => ({
              name: typeof e.name === 'string' ? e.name : 'unknown',
              score: typeof e.score === 'number' ? e.score : undefined,
            })),
          });

          // Post eval scores to the API server (fire-and-forget)
          postExperimentScores(evt, `http://localhost:${process.env.AGENTMARK_API_PORT || '9418'}`);

          // Initialize table on first row
          if (!tableInitialized) {
            evalNames = evalEnabled ? evals.map((e: any) => e.name).filter(Boolean) : [];
            const layout = computeLayout(['#', 'Input', 'AI Result', 'Expected Output'], evalNames, []);
            Table = await getTable();
            table = new Table({
              head: layout.head,
              colWidths: layout.colWidths,
              wordWrap: true
            });
            tableInitialized = true;
          }

          // Build and render row immediately (truncate AI Result for table)
          const row: string[] = [String(index), input, truncate(actual), truncate(expected)];

          // Add eval columns
          for (const name of evalNames) {
            const e = evals.find((ev: any) => ev.name === name);
            if (e) {
              if (typeof e.passed === 'boolean') {
                const isPass = e.passed;
                const verdictText = isPass ? 'PASS' : 'FAIL';
                const scorePart = typeof e.score === 'number' ? e.score.toFixed(2) : '';
                const reasonPart = typeof e.reason === 'string' && e.reason ? ` - ${e.reason}` : '';
                const suffix = scorePart || reasonPart ? ` (${scorePart}${reasonPart})` : '';
                row.push(`${verdictText}${suffix}`);
                totalEvals += 1;
                if (isPass) passedEvals += 1;
              } else {
                const parts: string[] = [];
                if (typeof e.score === 'number') parts.push(`score: ${e.score.toFixed(2)}`);
                if (typeof e.label === 'string' && e.label) parts.push(`label: ${e.label}`);
                if (typeof e.reason === 'string' && e.reason) parts.push(`reason: ${e.reason}`);
                row.push(parts.length > 0 ? parts.join(', ') : 'N/A');
              }
            } else {
              row.push('N/A');
            }
          }

          // Print row immediately
          if (format === 'table') {
            table.push(row);
            // Print just the header + current row (first time) or just the new row
            if (index === 1) {
              console.log(table.toString());
            } else {
              // For subsequent rows, print the row content with bottom border (separator line)
              const tempTable = new Table({
                head: [],
                colWidths: table.options.colWidths,
                wordWrap: true,
                style: { head: [], border: table.options.style.border }
              });
              tempTable.push(row);
              const lines = tempTable.toString().split('\n');
              // Skip only the top border (line 0), keep row content and bottom border
              console.log(lines.slice(1).join('\n'));
            }
          } else if (format === 'csv') {
            const headers = ['#', 'Input', 'AI Result', 'Expected Output', ...evalNames];
            if (index === 1) {
              console.log(headers.map(h => escapeCSV(h)).join(','));
            }
            console.log(row.map(cell => escapeCSV(cell)).join(','));
          } else if (format === 'json') {
            // Buffer for JSON format since it needs to be a valid array
            const headers = ['#', 'Input', 'AI Result', 'Expected Output', ...evalNames];
            const obj: Record<string, string> = {};
            headers.forEach((header, idx) => {
              obj[header] = row[idx] || '';
            });
            jsonRows.push(obj);
          } else if (format === 'jsonl') {
            // Output each row as a JSON line immediately
            const headers = ['#', 'Input', 'AI Result', 'Expected Output', ...evalNames];
            const obj: Record<string, string> = {};
            headers.forEach((header, idx) => {
              obj[header] = row[idx] || '';
            });
            console.log(JSON.stringify(obj));
          } else if (format === 'junit') {
            // Buffer structured row data for JUnit XML emission after the
            // stream completes. We capture raw values (not the table-display
            // strings) so the formatter can decide how to stringify each
            // payload type. `rowInputHash` (computed above) attaches each
            // scorer's matched baseline score for the per-row XML failure detail.
            junitRows.push({
              index,
              input: r.input,
              actualOutput: r.actualOutput,
              expectedOutput: r.expectedOutput,
              evals: evals.map((e: any) => {
                const name = typeof e.name === 'string' ? e.name : 'unknown';
                return {
                  name,
                  score: typeof e.score === 'number' ? e.score : undefined,
                  passed: typeof e.passed === 'boolean' ? e.passed : undefined,
                  label: typeof e.label === 'string' ? e.label : undefined,
                  reason: typeof e.reason === 'string' ? e.reason : undefined,
                  baselineScore: rowInputHash !== undefined
                    ? baselineMap.get(`${rowInputHash}::${name}`)
                    : undefined,
                };
              }),
            });
          }

          // Print media paths immediately
          if (extraPaths.length) {
            for (const p of extraPaths) {
              const label = p.kind === 'image' ? 'Image path' : 'Audio path';
              console.log(`${label}: ${p.rel}`);
            }
          }

          index += 1;
        } catch {
          // Ignore errors when processing dataset events
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Output JSON format after streaming is complete
  if (format === 'json' && jsonRows.length > 0) {
    console.log(JSON.stringify(jsonRows, null, 2));
  }

  // Evaluate the regression gate once, via the shared primitive (same gate the
  // SDK uses). Format-independent: it fires for table/csv/json, not only junit.
  const gate = evaluateExperimentGate({
    rows: gateRows,
    baseline: baselineMap,
    regressionTolerance,
    scoreThresholds: evalEnabled ? testSettings?.score_thresholds : undefined,
  });

  // Guard the silent no-op: a baseline run resolved, yet NONE of this run's rows
  // matched it by input hash — so the per-row regression gate compared nothing
  // and would pass green having checked nothing. Happens when inputs are masked
  // (hideInputs / a mask fn rewrites the stored input the gate hashes), or when
  // the experiment_key / dataset input differs from the baseline run. Warn
  // loudly on stderr (stdout stays clean for `> results.xml`) rather than gate
  // silently — same contract as the recency-fallback / no-baseline warnings.
  if (baselineMap.size > 0) {
    const matchedRows = gate.rowResults.filter((r) =>
      r.evals.some((e) => e.baselineScore !== undefined),
    ).length;
    if (matchedRows === 0) {
      console.error(
        `⚠️  Baseline resolved but 0/${gate.rowResults.length} rows matched it by input hash — regression gate compared nothing. ` +
        `Inputs may be masked (hideInputs/mask), or the experiment_key / dataset input may differ from the baseline run.`
      );
    }
  }

  // Output JUnit XML after streaming is complete (one console.log call so
  // users can redirect with `> results.xml` — the consumer's XML parser will
  // ignore trailing whitespace).
  if (format === 'junit') {
    const suiteName = promptName || path.basename(resolvedFilepath);
    // The XML re-derives per-row failures from the same `isRegression` predicate
    // the gate uses, so the count shown here and the gate's verdict agree.
    const report = buildJUnitReport(junitRows, {
      suiteName,
      promptPath: promptName,
      commitSha,
      baselineCommitSha,
      runId: experimentRunId,
      regressionTolerance,
      scoreThresholds: gate.scoreThresholdResults,
    });
    console.log(report.xml);
  }

  // Display link to view all experiment traces (only for text or object prompts)
  if (experimentRunId && format === 'table' && (promptType === 'Text' || promptType === 'Object')) {
    const { getAppPort } = await import('../config.js');
    const appPort = getAppPort();
    console.log(`\n📊 View traces: http://localhost:${appPort}/traces?runId=${experimentRunId}`);
  }

  if (evalEnabled && totalEvals > 0 && options.thresholdPercent !== undefined) {
    const t = options.thresholdPercent;
    if (!Number.isFinite(t) || t < 0 || t > 100) {
      throw new Error(
        `Invalid threshold value: ${t}\n` +
        'Threshold must be a number between 0 and 100 (representing percentage).'
      );
    }
    const passPct = Math.floor((passedEvals / totalEvals) * 100);
    if (passPct < t) {
      console.error(
        `❌ Experiment failed threshold check\n` +
        `   Pass rate: ${passPct}% (${passedEvals}/${totalEvals} evaluations passed)\n` +
        `   Threshold: ${t}%\n` +
        `   Difference: ${passPct - t}%`
      );
      throw new Error(`Experiment failed: pass rate ${passPct}% is below threshold ${t}%`);
    }
    // Skip the success banner for junit format: the XML is the only stdout
    // payload, and trailing text would invalidate the document for any
    // consumer redirecting with `> results.xml`.
    if (format !== 'junit') {
      console.log(
        `✅ Experiment passed threshold check\n` +
        `   Pass rate: ${passPct}% (${passedEvals}/${totalEvals} evaluations passed)\n` +
        `   Threshold: ${t}%`
      );
    }
  }

  // New gates fail the process with a non-zero exit: the run-level per-scorer
  // threshold gate (test_settings.score_thresholds) and the per-row
  // regression-vs-baseline gate. Absolute per-row failures are intentionally
  // NOT gated here — they're reported in the XML and gated by the consumer
  // (mikepenz / --threshold), preserving long-standing CLI behaviour. The error
  // goes to stderr, leaving any JUnit XML on stdout intact for `> out.xml`.
  for (const r of gate.failedScoreThresholds) {
    console.error(
      `❌ Scorer "${r.scorer}" mean ${r.mean.toFixed(3)} is below threshold ${r.threshold} (n=${r.count})`
    );
  }
  if (gate.regressionFailures > 0) {
    console.error(`❌ ${gate.regressionFailures} scorer result(s) regressed beyond tolerance vs baseline`);
  }
  if (!gate.passed) {
    const parts: string[] = [];
    if (gate.regressionFailures > 0) parts.push(`${gate.regressionFailures} regression(s)`);
    if (gate.failedScoreThresholds.length > 0) parts.push(`${gate.failedScoreThresholds.length} scorer threshold(s)`);
    throw new Error(`Experiment failed: ${parts.join(', ')}`);
  }
}
