import path from "path";
import fs from "fs";
import type { Root } from "mdast";
import Table from "cli-table3";
import { resolveRunner } from "../utils/resolve-runner";


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

export default async function runExperiment(filepath: string, options: { skipEval?: boolean; thresholdPercent?: number }) {
  const evalEnabled = !options.skipEval;
  const resolvedFilepath = path.resolve(process.cwd(), filepath);
  if (!fs.existsSync(resolvedFilepath)) throw new Error(`File not found: ${resolvedFilepath}`);
  const { load } = await import("@agentmark/templatedx");
  const ast: Root = await load(resolvedFilepath);
  const runner = await resolveRunner();

  console.log("Running prompt with dataset...");
  if (evalEnabled) console.log("🧪 Evaluations enabled");

  const { stream } = await runner.runExperiment(ast as any, 'cli-experiment');

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
          const actual = typeof r.actualOutput === 'string' ? r.actualOutput : JSON.stringify(r.actualOutput ?? '');
          const evals = Array.isArray(r.evals) ? r.evals : [];

          // Initialize header and layout on first row, including eval names when enabled
          if (!headerPrinted) {
            evalNames = evalEnabled ? evals.map((e: any) => e.name).filter(Boolean) : [];
            layout = computeLayout(['#', 'Input', 'AI Result', 'Expected Output'], evalNames);
            const headerTable = new Table({ head: layout.head, colWidths: layout.colWidths, wordWrap: true });
            console.log(headerTable.toString());
            headerPrinted = true;
          }

          const rowTable = new Table({ colWidths: (layout as LayoutResult).colWidths, wordWrap: true, style: { head: [] } });
          const row: string[] = [String(index), input, actual, expected];
          for (const name of evalNames) {
            const e = evals.find((ev: any) => ev.name === name);
            if (e && typeof e.score === 'number') {
              row.push(`${e.score.toFixed(2)} (${e.label ?? ''})`);
              totalEvals += 1;
              if (e.label === 'correct' || e.score >= 0.5) passedEvals += 1;
            } else {
              row.push('N/A');
            }
          }
          rowTable.push(row);
          const tableString = rowTable.toString();
          const lines = tableString.split('\n');
          console.log(lines.slice(1, -1).join('\n'));
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
    if (passPct < t) throw new Error(`Experiment failed: ${passPct}% < threshold ${t}% (${passedEvals}/${totalEvals} evals passed)`);
    console.log(`✅ Experiment passed threshold: ${passPct}% >= ${t}% (${passedEvals}/${totalEvals})`);
  }
}
