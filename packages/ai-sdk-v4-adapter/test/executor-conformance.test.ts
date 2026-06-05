/**
 * Conformance + chunk-binding tests for the v4 adapter's executor.
 *
 * The heavy protocol matrix lives in `@agentmark-ai/ai-sdk-shared`'s own
 * suite; this file proves the BINDING — that `VercelAIv4Executor` wires the
 * v4 chunk adapter (`textDelta` field on deltas, `usage` on finish) and the
 * pinned `ai` module functions into a protocol-correct executor. A wrong
 * `chunks:` binding (e.g. v5Chunks) would drop the `textDelta`-only delta
 * pinned below.
 */
import { describe, it, expect, vi } from "vitest";
import {
  assertTextStream,
  runExecutorConformance,
  type AgentEvent,
} from "@agentmark-ai/prompt-core";

// Mutable script consumed by the mocked `ai` module. The executor thunk-binds
// `ai.*` so per-test reassignment routes through the live mock.
const scripted: {
  fullStream: Array<Record<string, unknown>>;
  throwOn?: (params: Record<string, unknown>) => boolean;
} = { fullStream: [] };

vi.mock("ai", () => {
  const explode = (p: Record<string, unknown>) => {
    if (scripted.throwOn?.(p)) throw new Error("scripted failure");
  };
  return {
    jsonSchema: (s: unknown) => s,
    Output: { object: (_opts: unknown) => ({ __experimental_output: true }) },
    generateText: vi.fn(async (p: Record<string, unknown>) => {
      explode(p);
      return {
        text: "TEXT",
        usage: { promptTokens: 3, completionTokens: 7 },
        finishReason: "stop",
        steps: [],
      };
    }),
    generateObject: vi.fn(async (p: Record<string, unknown>) => {
      explode(p);
      return {
        object: { ok: true },
        usage: { promptTokens: 3, completionTokens: 7 },
        finishReason: "stop",
      };
    }),
    streamText: vi.fn((p: Record<string, unknown>) => {
      explode(p);
      return {
        fullStream: (async function* () {
          for (const c of scripted.fullStream) yield c;
        })(),
      };
    }),
    streamObject: vi.fn((p: Record<string, unknown>) => {
      explode(p);
      return {
        usage: Promise.resolve({ promptTokens: 3, completionTokens: 7 }),
        fullStream: (async function* () {
          yield { type: "object", object: { ok: true } };
        })(),
      };
    }),
    experimental_generateImage: vi.fn(),
    experimental_generateSpeech: vi.fn(),
  };
});

import { VercelAIv4Executor } from "../src/executor";

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

describe("VercelAIv4Executor — chunk binding", () => {
  it("reads v4-shaped chunks: `textDelta` deltas and `usage` on finish", async () => {
    scripted.throwOn = undefined;
    scripted.fullStream = [
      // v4 field names ONLY — a mis-bound v5 chunk adapter reads `text`
      // (absent here) and would drop this delta entirely.
      { type: "text-delta", textDelta: "hello" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 11, completionTokens: 22 },
      },
    ];
    const events = await collect(
      new VercelAIv4Executor().executeText({}, { shouldStream: true })
    );
    await assertTextStream(
      (async function* () {
        for (const e of events) yield e;
      })()
    );
    expect(events.map((e) => e.type)).toEqual(["text-delta", "finish"]);
    expect((events[0] as { text: string }).text).toBe("hello");
    const finish = events.at(-1) as Extract<AgentEvent, { type: "finish" }>;
    expect(finish.usage).toEqual({
      inputTokens: 11,
      outputTokens: 22,
      totalTokens: 33,
    });
  });

  it("passes the full executor conformance suite in both stream modes", async () => {
    scripted.throwOn = (p) => p.__explode === true;
    scripted.fullStream = [
      { type: "text-delta", textDelta: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1 },
      },
    ];
    await runExecutorConformance(new VercelAIv4Executor(), {
      text: {},
      object: {},
      errorInput: { __explode: true },
    });
  });
});
