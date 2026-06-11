import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hashRowInput } from "@agentmark-ai/prompt-core";
import { AgentMarkSDK } from "../agentmark";

describe("AgentMarkSDK.getBaselineScores", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("requests the baseline endpoint with auth + identity params and indexes rows by inputHash::scorer", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          resolved: { runId: "r1", treeHash: "tree-abc", matchedExactCommit: true },
          rows: [{ inputHash: "h1", scorer: "groundedness", score: 0.91 }],
        },
      }),
    });

    const sdk = new AgentMarkSDK({ apiKey: "key-123", appId: "app-1" });
    const { resolved, baseline } = await sdk.getBaselineScores({ experimentKey: "agent", treeHash: "tree-abc" });

    expect(resolved).toEqual({ runId: "r1", treeHash: "tree-abc", matchedExactCommit: true });
    expect(baseline.get("h1::groundedness")).toBe(0.91);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/v1/experiments/baseline?");
    expect(String(url)).toContain("experiment_key=agent");
    expect(String(url)).toContain("tree_hash=tree-abc");
    expect((init as any).headers.Authorization).toBe("key-123");
    expect((init as any).headers["X-Agentmark-App-Id"]).toBe("app-1");
  });
});

describe("AgentMarkSDK.runExperiment", () => {
  const input = { q: "alpha" };
  let fetchMock: ReturnType<typeof vi.fn>;

  function mockBackend(baselineScore: number) {
    fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes("/v1/experiments/baseline")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              resolved: { runId: "base", treeHash: "tree-old", matchedExactCommit: false },
              rows: [{ inputHash: hashRowInput(input), scorer: "acc", score: baselineScore }],
            },
          }),
        };
      }
      // score POST
      return { ok: true, json: async () => ({ data: {} }) };
    });
    vi.stubGlobal("fetch", fetchMock);
  }

  afterEach(() => vi.unstubAllGlobals());

  it("signal stops dispatching new rows; completed rows keep dataset order", async () => {
    mockBackend(0.5);
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });
    const controller = new AbortController();
    const ran: number[] = [];

    const result = await sdk.runExperiment({
      experimentKey: "cancel-test",
      dataset: Array.from({ length: 10 }, (_, i) => ({ input: { q: `row-${i}` } })),
      // concurrency 1 → rows run strictly in order; abort after the 3rd row
      // is dispatched, so rows 3-9 must never run.
      concurrency: 1,
      signal: controller.signal,
      task: async (taskInput: { q: string }) => {
        const i = Number(taskInput.q.split("-")[1]);
        ran.push(i);
        if (i === 2) controller.abort();
        return `out-${i}`;
      },
    });

    expect(ran).toEqual([0, 1, 2]);
    expect(result.rows.map((r) => (r.input as { q: string }).q)).toEqual([
      "row-0",
      "row-1",
      "row-2",
    ]);
  });

  it("runs the task + evaluators and fails the gate when a scorer regresses beyond tolerance", async () => {
    mockBackend(0.9); // live 0.5 vs baseline 0.9 = 44% drop, over 5% tolerance
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });

    const result = await sdk.runExperiment({
      experimentKey: "support-agent",
      dataset: [{ input }],
      task: async () => "agent output",
      evaluators: [{ name: "acc", evaluate: () => ({ score: 0.5 }) }],
      baselineTreeHash: "main",
      regressionTolerance: 0.05,
    });

    expect(result.passed).toBe(false);
    expect(result.regressionFailures).toBe(1);
    expect(result.baselineRowsMatched).toBe(1); // the row matched the baseline by input hash
    expect(result.resolved).toEqual({ runId: "base", treeHash: "tree-old", matchedExactCommit: false });
    // Per-row detail pinpoints the regressed case: its score, its baseline, the flag.
    expect(result.rows).toEqual([
      {
        input,
        output: "agent output",
        evals: [{ name: "acc", score: 0.5, passed: undefined, baselineScore: 0.9, regressed: true }],
      },
    ]);
    // A caller can pull exactly which cases regressed:
    const regressed = result.rows.flatMap((r) => r.evals.filter((e) => e.regressed));
    expect(regressed).toEqual([{ name: "acc", score: 0.5, passed: undefined, baselineScore: 0.9, regressed: true }]);
    // The eval score was posted to the backend.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/v1/scores"))).toBe(true);
  });

  it("passes the gate when the live score is within tolerance of the baseline", async () => {
    mockBackend(0.9); // live 0.88 vs 0.9 = 2.2% drop, within 5%
    const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });

    const result = await sdk.runExperiment({
      experimentKey: "support-agent",
      dataset: [{ input }],
      task: async () => "out",
      evaluators: [{ name: "acc", evaluate: () => ({ score: 0.88 }) }],
      baselineTreeHash: "main",
      regressionTolerance: 0.05,
    });

    expect(result.passed).toBe(true);
    expect(result.regressionFailures).toBe(0);
    expect(result.baselineRowsMatched).toBe(1);
  });

  it("surfaces baselineRowsMatched:0 (and warns) when a baseline resolves but no row matches by hash", async () => {
    // Baseline resolves with a row for a DIFFERENT input, so nothing matches by
    // hash. The live 0.1-vs-0.9 drop would look like a clean pass without the
    // guard — here it must stay inert (no false regression) AND be surfaced.
    const warnMock = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi.fn(async (url: unknown) => {
      if (String(url).includes("/v1/experiments/baseline")) {
        return {
          ok: true,
          json: async () => ({
            data: {
              resolved: { runId: "base", treeHash: "tree-old", matchedExactCommit: false },
              rows: [{ inputHash: hashRowInput({ q: "a-different-row" }), scorer: "acc", score: 0.9 }],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ data: {} }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      const sdk = new AgentMarkSDK({ apiKey: "k", appId: "a" });
      const result = await sdk.runExperiment({
        experimentKey: "support-agent",
        dataset: [{ input }],
        task: async () => "out",
        evaluators: [{ name: "acc", evaluate: () => ({ score: 0.1 }) }],
        baselineTreeHash: "main",
        regressionTolerance: 0.05,
      });

      expect(result.resolved).not.toBeNull(); // a baseline WAS resolved
      expect(result.baselineRowsMatched).toBe(0); // ...but nothing matched it by hash
      expect(result.regressionFailures).toBe(0);
      expect(result.passed).toBe(true); // inert, not a false failure
      expect(warnMock).toHaveBeenCalledWith(expect.stringContaining("0/1 rows matched by input hash"));
    } finally {
      warnMock.mockRestore();
    }
  });
});
