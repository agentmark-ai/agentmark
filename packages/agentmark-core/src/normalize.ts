import { EvalRegistry } from "./eval-registery";
import { EvalVerdict } from "./types";

export type ResultKind = "text" | "object" | "image" | "speech";

export type NormalizedEval = {
  name: string;
  verdict: "pass" | "fail";
  score?: number;
  label?: string;
  reason?: string;
};

export type NormalizedRow = {
  index: number;
  kind: ResultKind;
  input: Record<string, unknown>;
  expected?: unknown;
  output: unknown;
  evals: NormalizedEval[];
  meta?: Record<string, unknown>;
};

export function attachVerdicts(
  evalRegistry: EvalRegistry,
  evalResults: Array<{ name: string; score?: number; label?: string; reason?: string }>
): NormalizedEval[] {
  return evalResults.map((r) => {
    const def = evalRegistry.get(r.name);
    if (!def?.judge) {
      throw new Error(`No judge registered for eval '${r.name}'`);
    }
    const verdict = def.judge({ score: r.score ?? 0, label: r.label ?? "", reason: r.reason ?? "" });
    return {
      name: r.name,
      score: r.score,
      label: r.label,
      reason: r.reason,
      verdict: verdict === EvalVerdict.PASS ? "pass" : "fail",
    } satisfies NormalizedEval;
  });
}

export function normalizeTextRow(params: {
  index: number;
  input: Record<string, unknown>;
  expected?: unknown;
  text: string;
  evalRegistry: EvalRegistry;
  evalResults: Array<{ name: string; score?: number; label?: string; reason?: string }>;
  meta?: Record<string, unknown>;
}): NormalizedRow {
  const evals = attachVerdicts(params.evalRegistry, params.evalResults);
  return {
    index: params.index,
    kind: "text",
    input: params.input,
    expected: params.expected,
    output: params.text,
    evals,
    meta: params.meta,
  };
}

export function normalizeObjectRow(params: {
  index: number;
  input: Record<string, unknown>;
  expected?: unknown;
  object: Record<string, unknown>;
  evalRegistry: EvalRegistry;
  evalResults: Array<{ name: string; score?: number; label?: string; reason?: string }>;
  meta?: Record<string, unknown>;
}): NormalizedRow {
  const evals = attachVerdicts(params.evalRegistry, params.evalResults);
  return {
    index: params.index,
    kind: "object",
    input: params.input,
    expected: params.expected,
    output: params.object,
    evals,
    meta: params.meta,
  };
}
