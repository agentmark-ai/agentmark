/**
 * Type-level tests for the public Executor protocol + AgentEvent union.
 *
 * Every variant of AgentEvent must be exhaustively narrowable. A BYO-SDK
 * executor that implements the Executor interface must be assignable
 * to the imported type. These checks run at compile time via vitest's
 * `expectTypeOf`; if they fail, `yarn test` fails loudly.
 */
import { describe, it, expectTypeOf } from "vitest";
import type {
  AgentEvent,
  ExecCtx,
  Executor,
  ExecutorCapabilities,
  ObjectStreamEvent,
  TextStreamEvent,
  WebhookImageResponse,
  WebhookSpeechResponse,
} from "./index";

describe("AgentEvent exhaustiveness", () => {
  it("narrows every variant by discriminant `type`", () => {
    function assertNever(_: never): void {}
    function handle(ev: AgentEvent): void {
      switch (ev.type) {
        case "text-delta":
          expectTypeOf(ev.text).toEqualTypeOf<string>();
          return;
        case "reasoning-delta":
          expectTypeOf(ev.text).toEqualTypeOf<string>();
          return;
        case "object-delta":
          expectTypeOf(ev.partial).toEqualTypeOf<unknown>();
          return;
        case "object-final":
          expectTypeOf(ev.value).toEqualTypeOf<unknown>();
          return;
        case "tool-call":
          expectTypeOf(ev.id).toEqualTypeOf<string>();
          expectTypeOf(ev.name).toEqualTypeOf<string>();
          expectTypeOf(ev.args).toEqualTypeOf<unknown>();
          return;
        case "tool-result":
          expectTypeOf(ev.id).toEqualTypeOf<string>();
          expectTypeOf(ev.name).toEqualTypeOf<string>();
          expectTypeOf(ev.result).toEqualTypeOf<unknown>();
          expectTypeOf(ev.isError).toEqualTypeOf<boolean | undefined>();
          return;
        case "finish":
          expectTypeOf(ev.reason).toEqualTypeOf<string>();
          // usage is optional on finish
          expectTypeOf(ev.usage?.inputTokens).toEqualTypeOf<number | undefined>();
          return;
        case "error":
          expectTypeOf(ev.error).toEqualTypeOf<string>();
          return;
        default:
          // Exhaustiveness check — TS error here means a variant was added
          // to AgentEvent without updating consumers.
          assertNever(ev);
      }
    }
    // Ensure the function itself compiles (runtime no-op).
    expectTypeOf(handle).toBeFunction();
  });
});

describe("Executor protocol", () => {
  it("accepts a minimal conformant implementation", () => {
    class Minimal implements Executor {
      readonly name = "minimal-sdk";
      capabilities(): ExecutorCapabilities {
        return { text: true, object: true, image: false, speech: false };
      }
      async *executeText(
        _formatted: unknown,
        _ctx: ExecCtx
      ): AsyncIterable<TextStreamEvent> {
        yield { type: "text-delta", text: "hello" };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
      async *executeObject(
        _formatted: unknown,
        _ctx: ExecCtx
      ): AsyncIterable<ObjectStreamEvent> {
        yield { type: "object-final", value: { ok: true } };
        yield {
          type: "finish",
          reason: "stop",
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      }
    }
    expectTypeOf<Minimal>().toMatchTypeOf<Executor>();
  });

  it("enforces stream kind at compile time (object event rejected in text stream)", () => {
    async function* textStream(): AsyncIterable<TextStreamEvent> {
      yield { type: "text-delta", text: "ok" };
      // @ts-expect-error object-delta is not a TextStreamEvent — the kind-split
      // moves this from a runtime conformance failure to a compile error.
      yield { type: "object-delta", partial: { a: 1 } };
      yield { type: "finish", reason: "stop" };
    }
    expectTypeOf(textStream).toBeFunction();
  });

  it("accepts an optional-capability implementation with image/speech", () => {
    class Full implements Executor {
      readonly name = "full-sdk";
      capabilities(): ExecutorCapabilities {
        return { text: true, object: true, image: true, speech: true };
      }
      async *executeText(): AsyncIterable<TextStreamEvent> {
        yield { type: "error", error: "unimplemented" };
      }
      async *executeObject(): AsyncIterable<ObjectStreamEvent> {
        yield { type: "error", error: "unimplemented" };
      }
      async executeImage(): Promise<WebhookImageResponse> {
        return { type: "image", result: [], traceId: "" };
      }
      async executeSpeech(): Promise<WebhookSpeechResponse> {
        return {
          type: "speech",
          result: { mimeType: "", base64: "", format: "" },
          traceId: "",
        };
      }
    }
    expectTypeOf<Full>().toMatchTypeOf<Executor>();
  });

  it("ExecCtx carries telemetry + cancellation types", () => {
    expectTypeOf<ExecCtx["signal"]>().toEqualTypeOf<AbortSignal | undefined>();
    expectTypeOf<ExecCtx["shouldStream"]>().toEqualTypeOf<
      boolean | undefined
    >();
    expectTypeOf<ExecCtx["promptName"]>().toEqualTypeOf<string | undefined>();
  });
});
