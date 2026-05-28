/**
 * Tier 3 E2E validation script for PR #2388.
 * Boots the real API server, seeds baseline data via the OTLP ingest path,
 * fetches /v1/experiments/baseline over real HTTP, and validates the response
 * parses with parseBaselineResponse (the customer-facing seam in prompt-core).
 *
 * This covers everything the in-process unit tests skip: process boundary,
 * Express router, response serialization, and the parseBaselineResponse
 * adapter that turns the raw JSON into the gate's join-key map.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createApiServer } from "../cli-src/api-server";
import db from "../cli-src/server/database";
import { exportTraces } from "../cli-src/server/routes/traces";
import { normalizeOtlpSpans } from "@agentmark-ai/shared-utils";
import { hashRowInput, parseBaselineResponse } from "@agentmark-ai/prompt-core";
import type { Server } from "http";

let server: Server;
let port: number;

// Match the resourceSpan shape normalizeOtlpSpans expects (one wrapper per ingest).
function otlpResourceSpan(d: { traceId: string; runId: string; experimentKey: string; sourceTreeHash: string; input: unknown }) {
  const nowNs = `${Date.now() * 1_000_000}`;
  return {
    scopeSpans: [{
      spans: [{
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
      }],
    }],
  };
}

describe("Tier 3 — /v1/experiments/baseline HTTP E2E", () => {
  beforeAll(async () => {
    port = 19500 + Math.floor(Math.random() * 1000);
    server = (await createApiServer(port)) as Server;
  });
  afterAll(() => server?.close());
  beforeEach(() => {
    db.prepare("DELETE FROM traces").run();
    db.prepare("DELETE FROM scores").run();
  });

  it("returns the canonical response shape parseBaselineResponse expects", async () => {
    // Seed a run via the OTLP path (real ingest, real normalize)
    const input = { q: "what is 2+2" };
    const normalized = normalizeOtlpSpans([
      otlpResourceSpan({
        traceId: "tier3-trace-1",
        runId: "tier3-run-1",
        experimentKey: "./prompts/tier3.prompt.mdx",
        sourceTreeHash: "tree-tier3-abc",
        input,
      }),
    ] as any);
    await exportTraces(normalized);
    db.prepare(`INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
                VALUES ('s1', 'tier3-trace-1', 0.93, '', '', 'groundedness', 'experiment', 'eval', ?)`)
      .run(new Date().toISOString());

    // Hit the real HTTP endpoint
    const url = `http://localhost:${port}/v1/experiments/baseline?experiment_key=${encodeURIComponent("./prompts/tier3.prompt.mdx")}&tree_hash=tree-tier3-abc`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Validate against the customer-facing parser (the SAME path fetchBaselineScores uses)
    const { resolved, baseline } = parseBaselineResponse(body);
    expect(resolved).toEqual({ runId: "tier3-run-1", treeHash: "tree-tier3-abc", matchedExactCommit: true });

    // The join-key seam: server-stored input, re-hashed, equals hashRowInput of the live input
    const liveKey = hashRowInput(input);
    expect(baseline.get(`${liveKey}::groundedness`)).toBe(0.93);
  });

  it("returns empty resolved when no run exists for the experiment_key", async () => {
    const url = `http://localhost:${port}/v1/experiments/baseline?experiment_key=./none.prompt.mdx&tree_hash=zzz`;
    const res = await fetch(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    const { resolved, baseline } = parseBaselineResponse(body);
    expect(resolved).toBeNull();
    expect(baseline.size).toBe(0);
  });

  it("returns 400 on missing required params", async () => {
    const res = await fetch(`http://localhost:${port}/v1/experiments/baseline`);
    expect(res.status).toBe(400);
  });
});
