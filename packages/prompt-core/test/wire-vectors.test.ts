/**
 * Cross-language wire-format conformance: assert the TS event→chunk mappers
 * agree with the pinned JSON vectors in `@agentmark-ai/conformance-vectors`.
 * The mirror suite in `prompt-core-python/tests/test_wire_vectors.py` reads
 * the SAME `wire-chunks.json` and asserts the SAME expected values — so a
 * field rename in one runner's NDJSON (e.g. `toolCallId` → `tool_call_id`)
 * fails loudly in both CI runs instead of surfacing as a cloud-side parse
 * bug for one language's users.
 */
import { describe, it, expect } from "vitest";
// @ts-expect-error — @agentmark-ai/conformance-vectors is a JS data package
import { loadVector } from "@agentmark-ai/conformance-vectors";
import {
  textEventToWire,
  objectEventToWire,
  datasetRowToWire,
  textResponseToWire,
  objectResponseToWire,
  type DatasetRowParams,
} from "../src/wire";
import type { TextStreamEvent, ObjectStreamEvent } from "../src/executor";

interface WireChunkCase {
  name: string;
  kind: "text" | "object";
  event: Record<string, unknown>;
  expected: Record<string, unknown> | null;
}

interface DatasetRowCase {
  name: string;
  args: Record<string, unknown>;
  expected: Record<string, unknown>;
}

/** Normalize through JSON so `usage: undefined` (dropped by JSON.stringify
 * on the real wire) compares equal to an absent key in the vector. */
const roundtrip = (v: unknown) => JSON.parse(JSON.stringify(v));

describe("conformance-vectors — wire-chunks", () => {
  const { cases } = loadVector("wire-chunks") as { cases: WireChunkCase[] };

  for (const c of cases) {
    it(`[${c.kind}] ${c.name}`, () => {
      const chunk =
        c.kind === "text"
          ? textEventToWire(c.event as unknown as TextStreamEvent)
          : objectEventToWire(c.event as unknown as ObjectStreamEvent);

      if (c.expected === null) {
        expect(chunk).toBeUndefined();
        return;
      }
      expect(chunk).toBeDefined();
      expect(roundtrip(chunk)).toEqual(c.expected);
    });
  }

  it("covers every wired text/object event type (additions need a vector)", () => {
    // If a new AgentEvent variant starts emitting wire chunks, this inventory
    // forces a vector case for it — the cross-language pin is the point.
    const kinds = new Set(cases.map((c) => (c.event as { type: string }).type));
    expect([...kinds].sort()).toEqual(
      [
        "error",
        "finish",
        "object-delta",
        "object-final",
        "reasoning-delta",
        "text-delta",
        "tool-call",
        "tool-result",
      ].sort()
    );
  });
});

describe("conformance-vectors — dataset-rows", () => {
  const { cases } = loadVector("dataset-rows") as { cases: DatasetRowCase[] };

  for (const c of cases) {
    it(c.name, () => {
      // Vector args use TS field names directly; absent keys arrive as
      // undefined, exercising the omission semantics the vector pins.
      const chunk = datasetRowToWire(c.args as unknown as DatasetRowParams);
      expect(roundtrip(chunk)).toEqual(c.expected);
    });
  }
});

interface ResponseEnvelopeCase {
  name: string;
  kind: "text" | "object";
  args: Record<string, unknown>;
  expected: Record<string, unknown>;
}

describe("conformance-vectors — response-envelopes", () => {
  const { cases } = loadVector("response-envelopes") as {
    cases: ResponseEnvelopeCase[];
  };

  for (const c of cases) {
    it(`[${c.kind}] ${c.name}`, () => {
      const envelope =
        c.kind === "text"
          ? textResponseToWire(c.args as Parameters<typeof textResponseToWire>[0])
          : objectResponseToWire(
              c.args as Parameters<typeof objectResponseToWire>[0]
            );
      expect(roundtrip(envelope)).toEqual(c.expected);
    });
  }
});
