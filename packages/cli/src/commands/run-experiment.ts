import path from "path";
import fs from "fs";
import type { Root } from "mdast";
import { pathToFileURL } from "url";

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

function resolveAgainstCwdOrEnv(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  let base: string | undefined;
  try { base = process.cwd(); } catch { base = process.env.PWD; }
  if (!base) throw new Error('Invalid working directory. Provide an absolute path or set PWD.');
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


export default async function runExperiment(filepath: string, options: { skipEval?: boolean; format?: string; thresholdPercent?: number; server?: string }) {
  const evalEnabled = !options.skipEval;
  const format = options.format || 'table';
  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);
  if (!fs.existsSync(resolvedFilepath)) throw new Error(`File not found: ${resolvedFilepath}`);

  // Store original working directory before changing directories
  const originalCwd = (() => {
    try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
  })();

  // Ensure runner client resolves prompt-relative resources (datasets, etc.)
  try { process.env.AGENTMARK_ROOT = path.dirname(resolvedFilepath); } catch {}
  const { load } = await import("@agentmark/templatedx");
  // If current cwd is invalid, switch to the prompt's directory to stabilize deps that use process.cwd()
  try { process.chdir(path.dirname(resolvedFilepath)); } catch {}
  const ast: Root = await load(resolvedFilepath);
  // Extract dataset path and prompt relative path for runner consumption (helps cloud loader resolve URLs)
  let datasetPath: string | undefined;
  const promptPath = path.basename(resolvedFilepath);
  try {
    const yamlNode: any = (ast as any)?.children?.find((n: any) => n?.type === 'yaml');
    datasetPath = yamlNode ? (await import('yaml')).parse(yamlNode.value)?.test_settings?.dataset : undefined;
  } catch {}

  const server = options.server || 'http://localhost:9417';
  if (!server || !/^https?:\/\//i.test(server)) {
    throw new Error('Server URL is required. Make sure the dev server is running.');
  }

  // Only show status messages for table format
  if (format === 'table') {
    console.log("Running prompt with dataset...");
    if (evalEnabled) console.log("🧪 Evaluations enabled");
  }

  const res = await fetch(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'dataset-run', data: { ast, promptPath, datasetPath, experimentId: 'local-experiment' } })
  });
  // No debug logging by default
  if (!res.ok) {
    let raw = '';
    try { raw = await res.text(); } catch {}
    let parsed: any = null;
    try { parsed = JSON.parse(raw); } catch {}
    const ct = res.headers.get('content-type') || '';
    const statusLine = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
    const errMsg = parsed?.error || parsed?.message || raw?.slice?.(0, 2000) || 'Unknown error';
    const details = `HTTP ${statusLine} — Content-Type: ${ct}`;
    const msg = `Runner request failed. ${details}\nURL: ${server}\nBody: ${errMsg}`;
    console.error(msg);
    // No debug logging by default
    throw new Error(msg);
  }
  const stream = res.body!;

  let index = 1;
  let totalEvals = 0; let passedEvals = 0;
  let evalNames: string[] = [];
  let tableInitialized = false;
  let Table: any;
  let table: any;
  let jsonRows: any[] = []; // For buffering JSON format output

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
          if (evt.type !== 'dataset') continue;
          const r = evt.result || {};
          const input = JSON.stringify(r.input ?? {}, null, 0);
          const expected = r.expectedOutput ?? 'N/A';

          // Coerce AI result column, saving media to files and printing IDE-clickable paths
          let actual: string;
          let extraPaths: Array<{ rel: string; kind: 'image' | 'audio' } > = [];
          const hyperlink = (label: string, url: string) => `\u001B]8;;${url}\u0007${label}\u001B]8;;\u0007`;
          const outDir = path.resolve(originalCwd, '.agentmark-output');
          const ensureOutDir = () => { try { fs.mkdirSync(outDir, { recursive: true }); } catch {} };
          const ao = r.actualOutput;
          if (Array.isArray(ao) && ao.length > 0 && ao.every((x: any) => x && typeof x.base64 === 'string')) {
            // Image array output
            ensureOutDir();
            const timestamp = Date.now();
            const linkLabels: string[] = [];
            ao.forEach((img: any, idx: number) => {
              const ext = (img.mimeType?.split?.('/')?.[1]) || 'png';
              const filePath = path.join(outDir, `image-${index}-${idx + 1}-${timestamp}.${ext}`);
              try { fs.writeFileSync(filePath, Buffer.from(img.base64, 'base64')); } catch {}
              const rel = path.relative(originalCwd, filePath);
              extraPaths.push({ rel: rel.startsWith('.') ? rel : `./${rel}`, kind: 'image' });
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
            try { fs.writeFileSync(filePath, Buffer.from(ao.base64, 'base64')); } catch {}
            const url = pathToFileURL(filePath).href;
            actual = hyperlink('Play Audio', url);
            const rel = path.relative(originalCwd, filePath);
            extraPaths.push({ rel: rel.startsWith('.') ? rel : `./${rel}`, kind: 'audio' });
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
          }

          // Print media paths immediately
          if (extraPaths.length) {
            for (const p of extraPaths) {
              const label = p.kind === 'image' ? 'Image path' : 'Audio path';
              console.log(`${label}: ${p.rel}`);
            }
          }

          index += 1;
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Output JSON format after streaming is complete
  if (format === 'json' && jsonRows.length > 0) {
    console.log(JSON.stringify(jsonRows, null, 2));
  }

  if (evalEnabled && totalEvals > 0 && options.thresholdPercent !== undefined) {
    const t = options.thresholdPercent;
    if (!Number.isFinite(t) || t < 0 || t > 100) throw new Error(`Invalid threshold: ${t}. Threshold must be between 0 and 100.`);
    const passPct = Math.floor((passedEvals / totalEvals) * 100);
    if (passPct < t) {
      console.error(`❌ Experiment failed: ${passPct}% < threshold ${t}% (${passedEvals}/${totalEvals} evals passed)`);
      throw new Error(`Experiment failed: ${passPct}% < threshold ${t}% (${passedEvals}/${totalEvals} evals passed)`);
    }
    console.log(`✅ Experiment passed threshold: ${passPct}% >= ${t}% (${passedEvals}/${totalEvals})`);
  }
}
