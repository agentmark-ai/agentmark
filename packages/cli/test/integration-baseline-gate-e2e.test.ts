/**
 * End-to-end of the LOCAL backend regression-gate loop, against the real
 * in-memory SQLite DB — NO endpoint mocks. Every other test stubs the baseline
 * endpoint; this one exercises the seam they skip:
 *
 *   ingest a baseline run -> resolve it (real getBaselineScores) -> match a live
 *   candidate run by input hash (real hashRowInput) -> render a verdict
 *   (real evaluateExperimentGate).
 *
 * The load-bearing assertion in every positive case is that the baseline came
 * back NON-EMPTY and MATCHED — a regression gate that silently finds no baseline
 * also "passes", so "passed" alone is a false green.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import db from "../cli-src/server/database";
import { getBaselineScores } from "../cli-src/server/routes/experiments";
import { hashRowInput, evaluateExperimentGate, baselineKey, type GateRow } from "@agentmark-ai/prompt-core";

function clearDatabase() {
  db.prepare("DELETE FROM traces").run();
  db.prepare("DELETE FROM scores").run();
}

/** Ingest one baseline experiment row exactly as a stored run looks: a root span
 *  carrying the experiment identity + the dataset input. */
function ingestRow(d: {
  traceId: string;
  runId: string;
  experimentKey: string;
  sourceTreeHash: string;
  input: unknown;
  timestamp?: string;
}) {
  const ts = d.timestamp ?? new Date().toISOString();
  db.prepare(`
    INSERT INTO traces (
      TraceId, SpanId, ParentSpanId, SpanName, Type, Timestamp, CreatedAt, Duration,
      DatasetRunId, ExperimentKey, SourceTreeHash, DatasetInput
    ) VALUES (?, ?, NULL, 'root', 'SPAN', ?, ?, 100, ?, ?, ?, ?)
  `).run(d.traceId, `${d.traceId}-root`, ts, ts, d.runId, d.experimentKey, d.sourceTreeHash, JSON.stringify(d.input));
}

function ingestScore(resourceId: string, name: string, score: number) {
  db.prepare(`
    INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
    VALUES (?, ?, ?, '', '', ?, 'experiment', 'eval', ?)
  `).run(`${resourceId}-${name}`, resourceId, score, name, new Date().toISOString());
}

/** Resolve a baseline the way the CLI does, into the gate's score map. */
async function resolveBaseline(experimentKey: string, treeHash: string) {
  const { resolved, rows } = await getBaselineScores(experimentKey, treeHash);
  const map = new Map<string, number>(rows.map((r) => [baselineKey(r.inputHash, r.scorer), r.score]));
  return { resolved, map, rowCount: rows.length };
}

const KEY = "./prompts/qa.prompt.mdx";
const TREE = "tree-base";
const inputA = { q: "alpha" };
const inputB = { q: "beta" };

describe("baseline regression gate — local backend e2e (no mocks)", () => {
  beforeEach(() => clearDatabase());
  afterEach(() => clearDatabase());

  it("catches a real regression and pinpoints the exact case, end to end", async () => {
    // Baseline run: both cases scored 0.91.
    ingestRow({ traceId: "b1", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputA });
    ingestRow({ traceId: "b2", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputB });
    ingestScore("b1", "groundedness", 0.91);
    ingestScore("b2", "groundedness", 0.91);

    const { resolved, map, rowCount } = await resolveBaseline(KEY, TREE);
    // The baseline ACTUALLY matched (guards the empty-baseline false-green).
    expect(resolved?.matchedExactCommit).toBe(true);
    expect(rowCount).toBe(2);

    // Candidate run: case A craters to 0.50 (regression), case B holds at 0.92.
    const candidate: GateRow[] = [
      { inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.5 }] },
      { inputHash: hashRowInput(inputB), evals: [{ name: "groundedness", score: 0.92 }] },
    ];
    const gate = evaluateExperimentGate({ rows: candidate, baseline: map, regressionTolerance: 0.05 });

    expect(gate.passed).toBe(false);
    expect(gate.regressionFailures).toBe(1);
    // Exactly case A's groundedness regressed, with its baseline attached.
    const regressed = gate.rowResults.flatMap((r) =>
      r.evals.filter((e) => e.regressed).map((e) => ({ inputHash: r.inputHash, ...e })),
    );
    expect(regressed).toEqual([
      { inputHash: hashRowInput(inputA), name: "groundedness", score: 0.5, baselineScore: 0.91, regressed: true },
    ]);
  });

  it("passes when the live scores are within tolerance of a real matched baseline", async () => {
    ingestRow({ traceId: "b1", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputA });
    ingestScore("b1", "groundedness", 0.91);

    const { resolved, map, rowCount } = await resolveBaseline(KEY, TREE);
    expect(resolved?.matchedExactCommit).toBe(true);
    expect(rowCount).toBe(1);

    // 0.89 vs 0.91 = 2.2% drop, within the 5% tolerance.
    const gate = evaluateExperimentGate({
      rows: [{ inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.89 }] }],
      baseline: map,
      regressionTolerance: 0.05,
    });
    expect(gate.passed).toBe(true);
    expect(gate.regressionFailures).toBe(0);
  });

  it("does not cross-wire a different experiment_key sharing the dataset (gate stays inert)", async () => {
    // A DIFFERENT eval ran at the same tree hash against the same input.
    ingestRow({ traceId: "o1", runId: "run-other", experimentKey: "./prompts/OTHER.prompt.mdx", sourceTreeHash: TREE, input: inputA });
    ingestScore("o1", "groundedness", 0.95);

    const { resolved, map } = await resolveBaseline(KEY, TREE); // resolve as OUR key
    expect(resolved).toBeNull(); // no baseline for our key -> no match

    // Our candidate "regresses" vs the other eval's 0.95, but there's no baseline
    // for our key, so the gate is correctly inert (no false regression).
    const gate = evaluateExperimentGate({
      rows: [{ inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.1 }] }],
      baseline: map,
      regressionTolerance: 0.05,
    });
    expect(gate.passed).toBe(true);
    expect(gate.regressionFailures).toBe(0);
  });

  it("falls back to the most recent run of the key when no exact tree-hash match exists", async () => {
    ingestRow({ traceId: "old", runId: "run-old", experimentKey: KEY, sourceTreeHash: "tree-1", input: inputA, timestamp: "2026-01-01T00:00:00.000Z" });
    ingestScore("old", "groundedness", 0.5);
    ingestRow({ traceId: "new", runId: "run-new", experimentKey: KEY, sourceTreeHash: "tree-2", input: inputA, timestamp: "2026-05-01T00:00:00.000Z" });
    ingestScore("new", "groundedness", 0.95);

    const { resolved, map } = await resolveBaseline(KEY, "tree-NONE"); // no exact match
    expect(resolved?.matchedExactCommit).toBe(false); // recency fallback, surfaced
    // Fell back to the most recent run (0.95); a live 0.6 is a >5% regression vs it.
    const gate = evaluateExperimentGate({
      rows: [{ inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.6 }] }],
      baseline: map,
      regressionTolerance: 0.05,
    });
    expect(gate.regressionFailures).toBe(1);
  });
});
