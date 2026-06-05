/**
 * Conformance + chunk-binding tests for the v5 adapter's executor.
 *
 * The heavy protocol matrix lives in `@agentmark-ai/ai-sdk-shared`'s own
 * suite; this file proves the BINDING — that `VercelAIExecutor` wires the
 * v5 chunk adapter (`text` field on deltas, `totalUsage` on finish) and the
 * pinned `ai` module functions into a protocol-correct executor. A wrong
 * `chunks:` binding (e.g. v4Chunks) fails the usage pin below.
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
        usage: { inputTokens: 3, outputTokens: 7 },
        finishReason: "stop",
        steps: [],
      };
    }),
    generateObject: vi.fn(async (p: Record<string, unknown>) => {
      explode(p);
      return {
        object: { ok: true },
        usage: { inputTokens: 3, outputTokens: 7 },
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
        usage: Promise.resolve({ inputTokens: 3, outputTokens: 7 }),
        fullStream: (async function* () {
          yield { type: "object", object: { ok: true } };
        })(),
      };
    }),
    experimental_generateImage: vi.fn(),
    experimental_generateSpeech: vi.fn(),
  };
});

import { VercelAIExecutor } from "../src/executor";

async function collect(events: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) out.push(ev);
  return out;
}

describe("VercelAIExecutor (v5) — chunk binding", () => {
  it("reads v5-shaped chunks: `text` deltas and `totalUsage` on finish", async () => {
    scripted.throwOn = undefined;
    scripted.fullStream = [
      // v5 field names ONLY — a mis-bound v4 chunk adapter reads `usage`
      // (absent here) and would zero-default the usage pinned below.
      { type: "text-delta", text: "hello" },
      {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 11, outputTokens: 22 },
      },
    ];
    const events = await collect(
      new VercelAIExecutor().executeText({}, { shouldStream: true })
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
      { type: "text-delta", text: "ok" },
      {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 1, outputTokens: 1 },
      },
    ];
    await runExecutorConformance(new VercelAIExecutor(), {
      text: {},
      object: {},
      errorInput: { __explode: true },
    });
  });
});
