/**
 * Efficacy tests for the conformance assertions themselves.
 *
 * The builder/adapter suites only ever feed CONFORMANT streams (executors that
 * are correct by construction) into assertTextStream/assertObjectStream/
 * assertErrorStream — so they prove the executors are fine but NOT that the
 * assertions actually REJECT violations. These tests feed hand-built VIOLATING
 * streams directly, so gutting an assertion's body would fail here. Mirrors the
 * Python `tests/test_executor.py` negative suite.
 */
import { describe, it, expect } from "vitest";
import type { AgentEvent, TextStreamEvent, ObjectStreamEvent } from "../src/index";
import {
  assertTextStream,
  assertObjectStream,
  assertErrorStream,
  assertAbortStream,
  assertUsageShape,
  ConformanceError,
} from "../src/index";

async function* stream<T>(events: T[]): AsyncIterable<T> {
  for (const e of events) yield e;
}
const USAGE = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };

// ── assertTextStream rejects each violation ──────────────────────────────────

describe("assertTextStream — rejects violations", () => {
  it("accepts a valid text stream (delta + finish-with-usage)", async () => {
    const obs = await assertTextStream(
      stream<TextStreamEvent>([
        { type: "text-delta", text: "hi" },
        { type: "finish", reason: "stop", usage: USAGE },
      ])
    );
    expect(obs).toHaveLength(2);
  });

  it("rejects when the error event is NOT terminal", async () => {
    await expect(
      assertTextStream(
        stream<TextStreamEvent>([
          { type: "text-delta", text: "hi" },
          { type: "error", error: "boom" },
          { type: "text-delta", text: "after-error" },
        ])
      )
    ).rejects.toThrow(/error event must be the terminal event/);
  });

  it("rejects TWO usage-bearing finishes (double-billing footgun)", async () => {
    await expect(
      assertTextStream(
        stream<TextStreamEvent>([
          { type: "text-delta", text: "hi" },
          { type: "finish", reason: "stop", usage: USAGE },
          { type: "finish", reason: "stop", usage: USAGE },
        ])
      )
    ).rejects.toThrow(/exactly one finish carrying usage/);
  });

  it("rejects a finish that carries NO usage", async () => {
    await expect(
      assertTextStream(
        stream<TextStreamEvent>([
          { type: "text-delta", text: "hi" },
          { type: "finish", reason: "stop" },
        ])
      )
    ).rejects.toThrow(/exactly one finish carrying usage/);
  });

  it("rejects an object event inside a text stream (runtime kind guard)", async () => {
    await expect(
      assertTextStream(
        // cast: a hand-rolled JS executor could emit the wrong kind at runtime
        stream<AgentEvent>([
          { type: "object-delta", partial: { a: 1 } },
          { type: "finish", reason: "stop", usage: USAGE },
        ]) as AsyncIterable<TextStreamEvent>
      )
    ).rejects.toThrow(/object-delta is not allowed in a text stream/);
  });

  it("rejects a tool-result with no preceding tool-call", async () => {
    await expect(
      assertTextStream(
        stream<TextStreamEvent>([
          { type: "tool-result", id: "c1", name: "search", result: "x" },
          { type: "finish", reason: "stop", usage: USAGE },
        ])
      )
    ).rejects.toThrow(/tool-result id=c1 has no preceding tool-call/);
  });

  it("rejects an empty stream (no text-delta or tool-call)", async () => {
    await expect(
      assertTextStream(
        stream<TextStreamEvent>([{ type: "finish", reason: "stop", usage: USAGE }])
      )
    ).rejects.toThrow(/no text-delta or tool-call/);
  });
});

// ── assertObjectStream rejects each violation ────────────────────────────────

describe("assertObjectStream — rejects violations", () => {
  it("accepts a valid object stream (final + finish-with-usage)", async () => {
    const obs = await assertObjectStream(
      stream<ObjectStreamEvent>([
        { type: "object-final", value: { a: 1 } },
        { type: "finish", reason: "stop", usage: USAGE },
      ])
    );
    expect(obs).toHaveLength(2);
  });

  it("rejects a text event inside an object stream", async () => {
    await expect(
      assertObjectStream(
        stream<AgentEvent>([
          { type: "text-delta", text: "nope" },
          { type: "object-final", value: {} },
          { type: "finish", reason: "stop", usage: USAGE },
        ]) as AsyncIterable<ObjectStreamEvent>
      )
    ).rejects.toThrow(/text-delta is not allowed in an object stream/);
  });

  it("rejects two usage-bearing finishes", async () => {
    await expect(
      assertObjectStream(
        stream<ObjectStreamEvent>([
          { type: "object-final", value: {} },
          { type: "finish", reason: "stop", usage: USAGE },
          { type: "finish", reason: "stop", usage: USAGE },
        ])
      )
    ).rejects.toThrow(/exactly one finish carrying usage/);
  });

  it("rejects an empty object stream", async () => {
    await expect(
      assertObjectStream(
        stream<ObjectStreamEvent>([{ type: "finish", reason: "stop", usage: USAGE }])
      )
    ).rejects.toThrow(/no object-delta or object-final/);
  });
});

// ── assertErrorStream ────────────────────────────────────────────────────────

describe("assertErrorStream", () => {
  it("accepts a stream whose terminal event is an error", async () => {
    const obs = await assertErrorStream(
      stream<TextStreamEvent>([
        { type: "text-delta", text: "partial" },
        { type: "error", error: "ServiceUnavailable" },
      ])
    );
    expect(obs[obs.length - 1]).toMatchObject({ type: "error" });
  });

  it("rejects a stream with no terminal error", async () => {
    await expect(
      assertErrorStream(
        stream<TextStreamEvent>([
          { type: "text-delta", text: "ok" },
          { type: "finish", reason: "stop", usage: USAGE },
        ])
      )
    ).rejects.toThrow(/expected terminal error event/);
  });

  it("rejects an executor that THROWS instead of emitting an error event", async () => {
    async function* thrower(): AsyncIterable<TextStreamEvent> {
      yield { type: "text-delta", text: "x" };
      throw new Error("sync-throw");
    }
    await expect(assertErrorStream(thrower())).rejects.toThrow(
      /threw during iteration/
    );
  });
});

// ── assertUsageShape (TS parity with Python) ─────────────────────────────────

describe("assertUsageShape", () => {
  it("accepts a well-formed usage payload", () => {
    expect(() => assertUsageShape({ inputTokens: 3, outputTokens: 7, totalTokens: 10 })).not.toThrow();
  });
  it("rejects negative inputTokens", () => {
    expect(() => assertUsageShape({ inputTokens: -1, outputTokens: 0 })).toThrow(
      ConformanceError
    );
  });
  it("rejects a non-numeric totalTokens", () => {
    expect(() =>
      assertUsageShape({ inputTokens: 1, outputTokens: 1, totalTokens: "10" as unknown as number })
    ).toThrow(/totalTokens/);
  });
});

// ── CRITICAL #1: abort — assertAbortStream is actually exercised ──────────────

describe("assertAbortStream — wired", () => {
  it("a cooperative executor stops yielding once the signal is aborted", async () => {
    const controller = new AbortController();
    let produced = 0;
    async function* infinite(): AsyncIterable<TextStreamEvent> {
      // A well-behaved executor checks the signal and stops cleanly.
      while (!controller.signal.aborted) {
        produced++;
        yield { type: "text-delta", text: `t${produced}` };
      }
    }
    const observed = await assertAbortStream(infinite(), controller, {
      abortAfterEvents: 3,
    });
    // The consumer stopped at the abort boundary; the executor did not run away.
    expect(observed).toHaveLength(3);
    expect(produced).toBe(3);
  });
});
