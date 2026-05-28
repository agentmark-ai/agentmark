/**
 * Full producer -> consumer e2e for the LOCAL backend — the linchpin seam every
 * other test seeds or mocks past. Drives the REAL ingest path a live run uses:
 *
 *   OTLP spans (carrying agentmark.experiment_key / source_tree_hash /
 *   dataset_input, as the SDK emits) -> real normalizeOtlpSpans -> real
 *   exportTraces (the actual SQLite write mapping) -> real getBaselineScores ->
 *   cross-run hashRowInput match -> real evaluateExperimentGate verdict.
 *
 * Nothing here hand-inserts the run row or mocks the endpoint, so it proves the
 * R1/R2-class invariant: a real run actually STORES the input + identity such
 * that a later run resolves it and the stored input re-hashes to the same join
 * key the live run computes. If the ingest mapping ever dropped a field or the
 * stored input diverged from what the gate hashes, this fails.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import db from "../cli-src/server/database";
import { exportTraces } from "../cli-src/server/routes/traces";
import { getBaselineScores } from "../cli-src/server/routes/experiments";
import { normalizeOtlpSpans } from "@agentmark-ai/shared-utils";
import { hashRowInput, evaluateExperimentGate, baselineKey, type GateRow } from "@agentmark-ai/prompt-core";

function clearDatabase() {
  db.prepare("DELETE FROM traces").run();
  db.prepare("DELETE FROM scores").run();
}

/** The OTLP a real run exports for one dataset item — a root span carrying the
 *  experiment identity + the row input as agentmark.* attributes. */
function otlpItem(d: { traceId: string; runId: string; experimentKey: string; sourceTreeHash: string; input: unknown }) {
  const nowNs = `${Date.now() * 1_000_000}`;
  return {
    scopeSpans: [
      {
        spans: [
          {
            traceId: d.traceId,
            spanId: `${d.traceId}-root`,
            name: "experiment",
            kind: 1,
            startTimeUnixNano: nowNs,
            endTimeUnixNano: nowNs,
            attributes: [
              { key: "agentmark.dataset_run_id", value: { stringValue: d.runId } },
              { key: "agentmark.experiment_key", value: { stringValue: d.experimentKey } },
              { key: "agentmark.source_tree_hash", value: { stringValue: d.sourceTreeHash } },
              { key: "agentmark.dataset_input", value: { stringValue: JSON.stringify(d.input) } },
            ],
          },
        ],
      },
    ],
  };
}

function ingestScore(traceId: string, name: string, score: number) {
  db.prepare(`
    INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
    VALUES (?, ?, ?, '', '', ?, 'experiment', 'eval', ?)
  `).run(`${traceId}-${name}`, traceId, score, name, new Date().toISOString());
}

const KEY = "./prompts/qa.prompt.mdx";
const TREE = "tree-base";
const inputA = { q: "alpha" };
const inputB = { q: "beta" };

describe("real ingest -> baseline gate e2e (no seeding, no mocks)", () => {
  beforeEach(() => clearDatabase());
  afterEach(() => clearDatabase());

  it("normalizes the new identity fields out of OTLP", () => {
    const [span] = normalizeOtlpSpans([
      otlpItem({ traceId: "t1", runId: "run-1", experimentKey: KEY, sourceTreeHash: TREE, input: inputA }),
    ]);
    // The normalizer must extract the fields the gate depends on from the wire.
    expect(span!.experimentKey).toBe(KEY);
    expect(span!.sourceTreeHash).toBe(TREE);
    expect(span!.datasetInput).toBe(JSON.stringify(inputA));
    expect(span!.datasetRunId).toBe("run-1");
  });

  it("ingests a real run, then resolves + hash-matches + gates a degraded candidate end to end", async () => {
    // Produce a baseline run through the REAL ingest path.
    const baselineSpans = normalizeOtlpSpans([
      otlpItem({ traceId: "base-a", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputA }),
      otlpItem({ traceId: "base-b", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputB }),
    ]);
    await exportTraces(baselineSpans);
    ingestScore("base-a", "groundedness", 0.91);
    ingestScore("base-b", "groundedness", 0.91);

    // Resolve it the way the CLI does — against what was actually stored.
    const { resolved, rows } = await getBaselineScores(KEY, TREE);

    // Matched a real run (guards the empty-baseline false-green).
    expect(resolved?.matchedExactCommit).toBe(true);
    expect(rows).toHaveLength(2);

    // THE invariant: the stored input, hashed by the consumer, equals the key the
    // live run computes from the original input. If ingest had dropped/changed
    // the input, these would diverge and the gate would silently never match.
    const baseline = new Map<string, number>(rows.map((r) => [baselineKey(r.inputHash, r.scorer), r.score]));
    expect(baseline.get(baselineKey(hashRowInput(inputA), "groundedness"))).toBe(0.91);
    expect(baseline.get(baselineKey(hashRowInput(inputB), "groundedness"))).toBe(0.91);

    // Gate a candidate: case A craters (regression), case B holds.
    const candidate: GateRow[] = [
      { inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.5 }] },
      { inputHash: hashRowInput(inputB), evals: [{ name: "groundedness", score: 0.92 }] },
    ];
    const gate = evaluateExperimentGate({ rows: candidate, baseline, regressionTolerance: 0.05 });

    expect(gate.passed).toBe(false);
    expect(gate.regressionFailures).toBe(1);
    const regressed = gate.rowResults.flatMap((r) => r.evals.filter((e) => e.regressed).map((e) => ({ inputHash: r.inputHash, ...e })));
    expect(regressed).toEqual([
      { inputHash: hashRowInput(inputA), name: "groundedness", score: 0.5, baselineScore: 0.91, regressed: true },
    ]);
  });

  it("passes when a re-run of the same code is within tolerance of its own ingested baseline", async () => {
    const spans = normalizeOtlpSpans([
      otlpItem({ traceId: "b1", runId: "run-base", experimentKey: KEY, sourceTreeHash: TREE, input: inputA }),
    ]);
    await exportTraces(spans);
    ingestScore("b1", "groundedness", 0.91);

    const { resolved, rows } = await getBaselineScores(KEY, TREE);
    expect(resolved?.matchedExactCommit).toBe(true);
    expect(rows).toHaveLength(1);

    const baseline = new Map<string, number>(rows.map((r) => [baselineKey(r.inputHash, r.scorer), r.score]));
    const gate = evaluateExperimentGate({
      rows: [{ inputHash: hashRowInput(inputA), evals: [{ name: "groundedness", score: 0.89 }] }],
      baseline,
      regressionTolerance: 0.05,
    });
    expect(gate.passed).toBe(true);
  });
});
