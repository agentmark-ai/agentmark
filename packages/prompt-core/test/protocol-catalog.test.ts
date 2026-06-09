/**
 * Cross-language protocol-type pinning: assert the TS AgentEvent union and
 * WireChunk union agree with the NORMATIVE catalog in
 * `conformance-vectors/protocol-catalog.json` (Python mirrors this suite
 * from its dataclasses in `tests/test_protocol_catalog.py`).
 *
 * The exhaustiveness is two-directional and COMPILE-anchored:
 *   - `EVENT_SAMPLES` is a mapped type keyed by `AgentEvent["type"]` — a
 *     new union variant fails to compile here until a sample (and, via the
 *     runtime assertion, a catalog entry) exists.
 *   - A catalog entry without a union variant fails the key-set equality.
 * Field shapes are then validated against the catalog's required/optional
 * field kinds with a dependency-free checker.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — @agentmark-ai/conformance-vectors is a JS data package
import { loadVector } from "@agentmark-ai/conformance-vectors";
import type { AgentEvent } from "../src/executor";
import type { WireChunk } from "../src/wire";
import type { WebhookRequest } from "../src/webhook-dispatch";
import { handleWebhookRequest } from "../src/webhook-dispatch";

type FieldKind = "string" | "number" | "boolean" | "any" | "usage";
interface VariantSpec {
  required: Record<string, FieldKind>;
  optional: Record<string, FieldKind>;
  discriminant?: Record<string, string>;
}
interface WebhookJobSpec {
  carriesAst: boolean;
  controlPlane: boolean;
}
interface Catalog {
  agentUsage: { required: Record<string, FieldKind>; optional: Record<string, FieldKind> };
  agentEvents: Record<string, VariantSpec>;
  wireChunks: Record<string, VariantSpec>;
  webhookJobs: Record<string, WebhookJobSpec>;
}

const catalog = loadVector("protocol-catalog") as unknown as Catalog;

// ── One sample per AgentEvent variant, keyed BY THE UNION — the compile-
//    time exhaustiveness anchor. Optional fields included so the field
//    checker exercises them.
const EVENT_SAMPLES: {
  [K in AgentEvent["type"]]: Extract<AgentEvent, { type: K }>;
} = {
  "text-delta": { type: "text-delta", text: "hi" },
  "reasoning-delta": { type: "reasoning-delta", text: "hmm" },
  "tool-call": { type: "tool-call", id: "t1", name: "search", args: { q: 1 } },
  "tool-result": {
    type: "tool-result",
    id: "t1",
    name: "search",
    result: "hit",
    isError: false,
  },
  "object-delta": { type: "object-delta", partial: { a: 1 } },
  "object-final": { type: "object-final", value: { a: 1 } },
  finish: {
    type: "finish",
    reason: "stop",
    usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
  },
  error: { type: "error", error: "boom" },
};

// ── One sample per WireChunk shape, `satisfies` keeps each honest against
//    the union; the key list mirrors the catalog's sub-variant names.
const WIRE_SAMPLES: Record<string, WireChunk> = {
  "text-result": { type: "text", result: "hi" },
  "text-toolCall": {
    type: "text",
    toolCall: { toolCallId: "t", toolName: "s", args: {} },
  },
  "text-toolResult": {
    type: "text",
    toolResult: { toolCallId: "t", toolName: "s", result: 1 },
  },
  "text-finish": {
    type: "text",
    finishReason: "stop",
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      promptTokens: 1,
      completionTokens: 2,
    },
  },
  "object-result": { type: "object", result: { a: 1 } },
  "object-usage": {
    type: "object",
    usage: {
      inputTokens: 1,
      outputTokens: 2,
      promptTokens: 1,
      completionTokens: 2,
    },
  },
  "dataset-row": {
    type: "dataset",
    result: {
      input: {},
      expectedOutput: "x",
      actualOutput: "x",
      evals: [],
    },
    traceId: "abc",
    runId: "r",
    runName: "n",
  },
  error: { type: "error", error: "boom" },
  done: { type: "done", traceId: "abc" },
} satisfies Record<string, WireChunk>;

function kindOk(value: unknown, kind: FieldKind, usage: Catalog["agentUsage"]): boolean {
  if (kind === "any") return true;
  if (kind === "usage") {
    if (typeof value !== "object" || value === null) return false;
    return fieldsOk(value as Record<string, unknown>, usage.required, usage.optional, usage);
  }
  return typeof value === kind;
}

function fieldsOk(
  obj: Record<string, unknown>,
  required: Record<string, FieldKind>,
  optional: Record<string, FieldKind>,
  usage: Catalog["agentUsage"]
): boolean {
  for (const [field, kind] of Object.entries(required)) {
    if (!(field in obj)) return false;
    if (!kindOk(obj[field], kind, usage)) return false;
  }
  for (const [field, kind] of Object.entries(optional)) {
    if (field in obj && obj[field] !== undefined && !kindOk(obj[field], kind, usage))
      return false;
  }
  return true;
}

describe("protocol catalog — AgentEvent", () => {
  it("the union's variant inventory exactly matches the catalog", () => {
    expect(Object.keys(EVENT_SAMPLES).sort()).toEqual(
      Object.keys(catalog.agentEvents).sort()
    );
  });

  for (const [variant, spec] of Object.entries(catalog.agentEvents)) {
    it(`'${variant}' sample satisfies the catalog spec`, () => {
      const sample = EVENT_SAMPLES[variant as AgentEvent["type"]] as unknown as Record<
        string,
        unknown
      >;
      expect(
        fieldsOk(sample, spec.required, spec.optional, catalog.agentUsage),
        `sample for '${variant}' violates the catalog`
      ).toBe(true);
    });
  }
});

describe("protocol catalog — WireChunk", () => {
  it("the sample inventory exactly matches the catalog", () => {
    expect(Object.keys(WIRE_SAMPLES).sort()).toEqual(
      Object.keys(catalog.wireChunks).sort()
    );
  });

  for (const [name, spec] of Object.entries(catalog.wireChunks)) {
    it(`'${name}' sample satisfies the catalog spec`, () => {
      const sample = WIRE_SAMPLES[name] as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(spec.discriminant ?? {})) {
        expect(sample[k], `discriminant ${k}`).toBe(v);
      }
      expect(
        fieldsOk(sample, spec.required, spec.optional, catalog.agentUsage),
        `sample for '${name}' violates the catalog`
      ).toBe(true);
    });
  }
});

// ── One sample per webhook JOB type, keyed BY THE UNION — the compile-time
//    exhaustiveness anchor for the managed dispatch contract (mirrors
//    EVENT_SAMPLES). A job added to WebhookRequest['type'] without a catalog
//    entry fails to compile here; a catalog entry without a union variant fails
//    the key-set equality. Python mirrors this from `WEBHOOK_JOB_TYPES`, so the
//    catalog is the single normative bridge between the two dispatches.
const JOB_SAMPLES: {
  [K in WebhookRequest["type"]]: WebhookJobSpec;
} = {
  "prompt-run": { carriesAst: true, controlPlane: false },
  "dataset-run": { carriesAst: true, controlPlane: false },
  "get-evals": { carriesAst: false, controlPlane: true },
};

class RecordingHandler {
  calls: string[] = [];
  constructor(readonly client: { getEvalNames(): string[] }) {}
  async runPrompt(): Promise<any> {
    this.calls.push("runPrompt");
    return { type: "object", result: {} };
  }
  async runExperiment(): Promise<any> {
    this.calls.push("runExperiment");
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    return { stream: (async function* () {})() };
  }
}

describe("protocol catalog — webhook jobs", () => {
  it("the dispatch's job-type union exactly matches the catalog", () => {
    expect(Object.keys(JOB_SAMPLES).sort()).toEqual(
      Object.keys(catalog.webhookJobs).sort()
    );
  });

  for (const [job, spec] of Object.entries(catalog.webhookJobs)) {
    it(`'${job}' routes (carriesAst=${spec.carriesAst}, controlPlane=${spec.controlPlane})`, async () => {
      const handler = new RecordingHandler({ getEvalNames: () => ["e"] });
      const data = spec.carriesAst ? { ast: { name: "p" } } : {};
      const res = await handleWebhookRequest(
        { type: job as WebhookRequest["type"], data },
        handler
      );
      // Routed, not the unknown-type error.
      expect(res.type).not.toBe("error");
      if (spec.controlPlane) {
        // Control-plane jobs answer from the client and never touch the handler.
        expect(res.type).toBe("json");
        expect(handler.calls).toEqual([]);
      }
    });
  }

  it("a non-catalogued job type is rejected", async () => {
    const handler = new RecordingHandler({ getEvalNames: () => [] });
    const res = await handleWebhookRequest(
      { type: "not-a-job" as WebhookRequest["type"], data: {} },
      handler
    );
    expect(res.type).toBe("error");
  });
});
