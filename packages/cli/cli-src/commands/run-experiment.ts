import path from "path";
import fs from "fs";
import type { Root } from "mdast";
import { pathToFileURL } from "url";
import { detectPromptTypeFromContent } from "../utils/prompt-detection.js";

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

export default async function runExperiment(filepath: string, options: { skipEval?: boolean; format?: string; thresholdPercent?: number; server?: string; saveOutput?: string }) {
  const evalEnabled = !options.skipEval;
  const format = options.format || 'table';
  const config = getExperimentConfig();

  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(
      `Prompt file not found: ${resolvedFilepath}\n` +
      `Please check that the file exists and the path is correct.`
    );
  }

  if (!resolvedFilepath.endsWith('.mdx') && !resolvedFilepath.endsWith('.json')) {
    throw new Error('File must be an .mdx or .json file');
  }

  // Load webhook secret BEFORE changing directory
  // (so we get it from the project root, not the prompt directory)
  let webhookSecret = process.env.AGENTMARK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    try {
      const { loadLocalConfig } = await import('../config.js');
      const config = loadLocalConfig();
      if (config && config.webhookSecret) {
        webhookSecret = config.webhookSecret;
      }
    } catch {
      // No config file, continue without signature
    }
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
      'Please ensure the AgentMark dev server is running with: agentmark dev\n' +
      `Expected format: http://localhost:9417 (got: ${server || 'undefined'})`
    );
  }

  // Only show status messages for table format
  if (format === 'table') {
    console.log("Running prompt with dataset...");
    if (evalEnabled) console.log("🧪 Evaluations enabled");
  }

  const body = JSON.stringify({ type: 'dataset-run', data: { ast, promptPath: promptName, datasetPath, experimentId: promptName } });

  // Add webhook signature if secret is available
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (webhookSecret) {
    const { createSignature } = await import('@agentmark-ai/shared-utils');
    const signature = await createSignature(webhookSecret, body);
    headers['x-agentmark-signature-256'] = signature;
  }

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
        `  agentmark dev\n\n` +
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
      helpText = '\n\nTip: The server is unavailable. Make sure the dev server is running with: agentmark dev';
    }

    const details = `HTTP ${statusLine} — Content-Type: ${ct}`;
    const msg = `Runner request failed. ${details}\nURL: ${server}\nError: ${errMsg}${helpText}`;
    console.error(msg);
    throw new Error(msg);
  }
  const stream = res.body!;

  let index = 1;
  let totalEvals = 0; let passedEvals = 0;
  let evalNames: string[] = [];
  let tableInitialized = false;
  let Table: any;
  let table: any;
  const jsonRows: any[] = []; // For buffering JSON format output
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
          const input = JSON.stringify(r.input ?? {}, null, 0);
          const expected = r.expectedOutput ?? 'N/A';

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

          // Build and render row immediately
          const row: string[] = [String(index), input, actual, expected];

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
    console.log(
      `✅ Experiment passed threshold check\n` +
      `   Pass rate: ${passPct}% (${passedEvals}/${totalEvals} evaluations passed)\n` +
      `   Threshold: ${t}%`
    );
  }
}
