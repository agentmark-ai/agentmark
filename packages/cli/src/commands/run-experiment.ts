import path from "path";
import fs from "fs";
import type { Root } from "mdast";
// Lazy-load cli-table3 so other commands (e.g., serve) don't pull ESM deps
let _Table: any;
async function getTable() {
  if (_Table) return _Table;
  const mod = await import('cli-table3');
  _Table = (mod as any).default || (mod as any);
  return _Table;
}
// HTTP-only: talk to server specified by AGENTMARK_SERVER
import { pathToFileURL } from "url";


const getTerminalWidth = (): number => {
  const cols = process.stdout.columns;
  return typeof cols === 'number' && cols > 0 ? cols : 120;
};

type LayoutResult = { head: string[]; colWidths: number[]; };

const computeLayout = (baseHead: string[], evalNames: string[] = []): LayoutResult => {
  const head = [...baseHead, ...evalNames];
  const terminalWidth = getTerminalWidth();
  const overhead = (head.length + 1) * 3;
  const mins = head.map((h, idx) => idx === 0 ? 3 : Math.max(Math.min(h.length + 4, 18), 10));
  const available = terminalWidth - overhead;
  const sumMins = mins.reduce((a, b) => a + b, 0);
  if (available <= sumMins) return { head, colWidths: mins };
  const weights = head.map((h, idx) => idx === 0 ? 1 : (h === 'AI Result' ? 4 : 3));
  const extra = available - sumMins;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const widths = mins.map((min, i) => min + Math.floor((extra * weights[i]) / weightSum));
  const diff = available - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += diff;
  return { head, colWidths: widths };
};

function resolveAgainstCwdOrEnv(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  let base: string | undefined;
  try { base = process.cwd(); } catch { base = process.env.PWD; }
  if (!base) throw new Error('Invalid working directory. Provide an absolute path or set PWD.');
  return path.resolve(base, inputPath);
}

export default async function runExperiment(filepath: string, options: { skipEval?: boolean; thresholdPercent?: number }) {
  const evalEnabled = !options.skipEval;
  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);
  if (!fs.existsSync(resolvedFilepath)) throw new Error(`File not found: ${resolvedFilepath}`);
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
  // No debug logging by default
  const server = process.env.AGENTMARK_SERVER || 'http://localhost:9417';
  if (!server || !/^https?:\/\//i.test(server)) {
    throw new Error('AGENTMARK_SERVER is required. Run your runner (e.g., npm run serve) and set --server or AGENTMARK_SERVER.');
  }

  console.log("Running prompt with dataset...");
  if (evalEnabled) console.log("🧪 Evaluations enabled");

  const url = `${server.replace(/\/$/, '')}/v1/run`;
  // No debug logging by default
  const res = await fetch(url, {
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
    const msg = `Runner request failed. ${details}\nURL: ${url}\nBody: ${errMsg}`;
    console.error(msg);
    // No debug logging by default
    throw new Error(msg);
  }
  const stream = res.body!;

  let index = 1;
  let totalEvals = 0; let passedEvals = 0;
  let headerPrinted = false;
  let evalNames: string[] = [];
  let layout: LayoutResult | null = null;
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
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
          const outDir = path.resolve(process.cwd(), 'agentmark-output');
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
              const rel = path.relative(process.cwd(), filePath);
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
            const rel = path.relative(process.cwd(), filePath);
            extraPaths.push({ rel: rel.startsWith('.') ? rel : `./${rel}`, kind: 'audio' });
          } else {
            actual = typeof ao === 'string' ? ao : JSON.stringify(ao ?? '');
          }
          const evals = Array.isArray(r.evals) ? r.evals : [];

          // Initialize header and layout on first row, including eval names when enabled
          if (!headerPrinted) {
            evalNames = evalEnabled ? evals.map((e: any) => e.name).filter(Boolean) : [];
            layout = computeLayout(['#', 'Input', 'AI Result', 'Expected Output'], evalNames);
            const Table = await getTable();
            const headerTable = new Table({ head: layout.head, colWidths: layout.colWidths, wordWrap: true });
            console.log(headerTable.toString());
            headerPrinted = true;
          }

          const Table = await getTable();
          const rowTable = new Table({ colWidths: (layout as LayoutResult).colWidths, wordWrap: true, style: { head: [] } });
          const row: string[] = [String(index), input, actual, expected];
          for (const name of evalNames) {
            const e = evals.find((ev: any) => ev.name === name);
            if (e) {
              // Only display verdict if it's present, otherwise show score/label/reason directly
              if (typeof e.verdict === 'string' && (e.verdict === 'pass' || e.verdict === 'fail')) {
                const isPass = e.verdict === 'pass';
                const verdictText = isPass ? 'PASS' : 'FAIL';
                const scorePart = typeof e.score === 'number' ? e.score.toFixed(2) : '';
                const reasonPart = typeof e.reason === 'string' && e.reason ? ` - ${e.reason}` : '';
                const suffix = scorePart || reasonPart ? ` (${scorePart}${reasonPart})` : '';
                row.push(`${verdictText}${suffix}`);
                totalEvals += 1;
                if (isPass) passedEvals += 1;
              } else {
                // No verdict - just show the raw eval properties
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
          rowTable.push(row);
          const tableString = rowTable.toString();
          const lines = tableString.split('\n');
          console.log(lines.slice(1, -1).join('\n'));
          if (extraPaths.length) {
            // Print relative paths on separate lines so IDE terminals can Cmd+Click them
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
