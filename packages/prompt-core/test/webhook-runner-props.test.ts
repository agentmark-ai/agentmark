/**
 * run-prompt records the template variables as `agentmark.props` — parity with
 * the experiment item span. The flat rendered messages (`agentmark.input`) are
 * a derived form; `agentmark.props` is the re-runnable dataset input, so a
 * `run-prompt --props` trace surfaces a Variables panel and captures variables
 * (not messages) on "Add to dataset", same as experiment runs. These pin that
 * ALL 6 prompt-run paths (text/object × streaming/non-streaming, image, speech)
 * stamp `agentmark.props` from `customProps`, and skip it when there are none.
 */
import { describe, it, expect, vi } from "vitest";
import type {
  ExecCtx,
  ExecutorCapabilities,
  Executor,
  TextStreamEvent,
  ObjectStreamEvent,
} from "../src/index";
import { WebhookRunner } from "../src/webhook-runner";
import type { PromptSpanHook, SpanLike } from "../src/span-hook";

const CUSTOM_PROPS = { ticket: "I was charged twice for my Pro plan." };

const ast = (name: string, cfg: string) =>
  ({
    children: [
      { type: "yaml", value: `name: ${name}\n${cfg}:\n  model_name: test\n` },
    ],
  }) as any;
const TEXT_AST = ast("greet-text", "text_config");
const OBJECT_AST = ast("greet-object", "object_config");
const IMAGE_AST = ast("greet-image", "image_config");
const SPEECH_AST = ast("greet-speech", "speech_config");

function makeExecutor(): Executor {
  return {
    name: "fake",
    capabilities: (): ExecutorCapabilities => ({ text: true, object: true, image: true, speech: true }),
    async *executeText(_f: unknown, _c: ExecCtx): AsyncIterable<TextStreamEvent> {
      yield { type: "text-delta", text: "hi" };
      yield { type: "finish", reason: "stop" };
    },
    async *executeObject(_f: unknown, _c: ExecCtx): AsyncIterable<ObjectStreamEvent> {
      yield { type: "object-final", value: { ok: true } };
      yield { type: "finish", reason: "stop" };
    },
    async executeImage() {
      return { result: [{ base64: "AAAA", mimeType: "image/png" }] } as any;
    },
    async executeSpeech() {
      return { result: { base64: "AAAA", mimeType: "audio/mp3" } } as any;
    },
  };
}

function makeClient() {
  const prompt = {
    async format() {
      return { _formatted: true };
    },
    async formatWithTestProps() {
      return { _formatted: true };
    },
  };
  return {
    getLoader: () => ({}),
    getEvalRegistry: () => undefined,
    loadTextPrompt: async () => prompt,
    loadObjectPrompt: async () => prompt,
    loadImagePrompt: async () => prompt,
    loadSpeechPrompt: async () => prompt,
  } as any;
}

/** Spy hook whose stub span records every setAttribute call. */
function makeSpyHook() {
  const setAttribute = vi.fn();
  const stub: SpanLike = { traceId: "t-1", setAttribute };
  const hook = (async (_params: any, fn: (span: SpanLike) => Promise<any>) => {
    const result = await fn(stub);
    return { result, traceId: stub.traceId };
  }) as unknown as PromptSpanHook;
  return { setAttribute, hook };
}

async function drainIfStream(res: any): Promise<void> {
  if (res?.type === "stream") {
    const reader = res.stream.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) break;
    }
  }
}

describe("WebhookRunner — run-prompt stamps agentmark.props from customProps", () => {
  const cases: Array<{ label: string; ast: any; options: any }> = [
    { label: "text streaming", ast: TEXT_AST, options: { shouldStream: true } },
    { label: "text non-streaming", ast: TEXT_AST, options: { shouldStream: false } },
    { label: "object streaming", ast: OBJECT_AST, options: { shouldStream: true } },
    { label: "object non-streaming", ast: OBJECT_AST, options: { shouldStream: false } },
    { label: "image", ast: IMAGE_AST, options: {} },
    { label: "speech", ast: SPEECH_AST, options: {} },
  ];

  for (const c of cases) {
    it(`records agentmark.props for ${c.label}`, async () => {
      const { setAttribute, hook } = makeSpyHook();
      const runner = new WebhookRunner(makeClient(), makeExecutor(), { promptSpanHook: hook });
      const res: any = await runner.runPrompt(c.ast, { ...c.options, customProps: CUSTOM_PROPS });
      await drainIfStream(res);
      expect(setAttribute).toHaveBeenCalledWith("agentmark.props", JSON.stringify(CUSTOM_PROPS));
    });
  }

  it("does NOT stamp agentmark.props when there are no customProps", async () => {
    const { setAttribute, hook } = makeSpyHook();
    const runner = new WebhookRunner(makeClient(), makeExecutor(), { promptSpanHook: hook });
    await runner.runPrompt(TEXT_AST, { shouldStream: false });
    expect(setAttribute).not.toHaveBeenCalledWith("agentmark.props", expect.anything());
  });
});
