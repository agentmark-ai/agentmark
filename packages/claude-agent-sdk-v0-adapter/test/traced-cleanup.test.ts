/**
 * SDK-iterator cleanup on early exit — both withTracing paths.
 *
 * The traced path iterates the SDK manually (each next() wrapped in the
 * OTEL parent context), which bypasses for-await's auto-close: without an
 * explicit `iterator.return()` in its finally, abandoning the stream
 * (abort, break, client disconnect) would leave the SDK generator's
 * cleanup to the GC. These tests pin that both the telemetry-enabled
 * manual loop AND the disabled `yield*` passthrough close the SDK
 * iterator deterministically.
 */
import { describe, it, expect } from "vitest";
import { withTracing } from "../src/traced";

function trackedIterable() {
  let returnCalled = false;
  let yielded = 0;
  const iterable: AsyncIterable<unknown> = {
    [Symbol.asyncIterator]() {
      return {
        async next() {
          yielded++;
          return {
            done: false,
            value: { type: "assistant", message: { content: [] } },
          };
        },
        async return() {
          returnCalled = true;
          return { done: true as const, value: undefined };
        },
      };
    },
  };
  return { iterable, state: () => ({ returnCalled, yielded }) };
}

describe("withTracing — SDK iterator cleanup on early exit", () => {
  it("telemetry-enabled (manual loop): closes the SDK iterator on break", async () => {
    const { iterable, state } = trackedIterable();
    const traced = await withTracing(() => iterable, {
      query: { prompt: "hi", options: {} },
      telemetry: { isEnabled: true, promptName: "cleanup-probe" },
    });

    let seen = 0;
    for await (const _ of traced) {
      void _;
      if (++seen === 2) break;
    }

    expect(seen).toBe(2);
    // The SDK's cleanup channel: return() must have been invoked NOW,
    // not left for GC.
    expect(state().returnCalled).toBe(true);
    // And the endless source must not have been drained past the exit
    // (one item of read-ahead tolerated).
    expect(state().yielded).toBeLessThanOrEqual(3);
  });

  it("telemetry-disabled (yield* passthrough): also closes the SDK iterator", async () => {
    const { iterable, state } = trackedIterable();
    const traced = await withTracing(() => iterable, {
      query: { prompt: "hi", options: {} },
    });

    for await (const _ of traced) {
      void _;
      break;
    }

    expect(state().returnCalled).toBe(true);
  });
});
