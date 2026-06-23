/**
 * Folder-aware prompt-path trace linking — WebhookRunner → PromptSpanHook params.
 *
 * The flat frontmatter `name` collides across folders (platform uniqueness is
 * `(app_id, name, parent_path, file_extension)`), so the webhook request carries
 * a `promptPath` that the dispatch forwards as `RunPromptOptions.promptPath`.
 * These tests pin that ALL prompt-run paths (text/object × streaming/non-
 * streaming, image, speech — the 6 promptSpanHook call sites) forward
 * `promptPath` to the hook verbatim, and that it is `undefined` when unset.
 * Mirrors `webhook-runner-commit-sha.test.ts`. The SDK then emits it as the
 * `agentmark.prompt_path` span attribute (pinned in the sdk tracing tests).
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

const PROMPT_PATH = "agentmark/support/triage.prompt.mdx";

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

/** Full-capability executor: text + object generators, image/speech results. */
function makeExecutor(): Executor {
  return {
    name: "fake",
    capabilities: (): ExecutorCapabilities => ({
      text: true,
      object: true,
      image: true,
      speech: true,
    }),
    async *executeText(
      _formatted: unknown,
      _ctx: ExecCtx
    ): AsyncIterable<TextStreamEvent> {
      yield { type: "text-delta", text: "hi" };
      yield { type: "finish", reason: "stop" };
    },
    async *executeObject(
      _formatted: unknown,
      _ctx: ExecCtx
    ): AsyncIterable<ObjectStreamEvent> {
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

/** Spy hook that records params and runs `fn` against a stub span. */
function makeSpyHook() {
  const stub: SpanLike = { traceId: "t-1", setAttribute: () => {} };
  const spy = vi.fn(
    async (_params: any, fn: (span: SpanLike) => Promise<any>) => {
      const result = await fn(stub);
      return { result, traceId: stub.traceId };
    }
  );
  return { spy, hook: spy as unknown as PromptSpanHook };
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

describe("WebhookRunner — promptSpanHook receives promptPath", () => {
  // Parameterized over all 6 promptSpanHook call sites.
  const cases: Array<{ label: string; ast: any; options: any; name: string }> = [
    { label: "text streaming", ast: TEXT_AST, options: { shouldStream: true, promptPath: PROMPT_PATH }, name: "greet-text" },
    { label: "text non-streaming", ast: TEXT_AST, options: { shouldStream: false, promptPath: PROMPT_PATH }, name: "greet-text" },
    { label: "object streaming", ast: OBJECT_AST, options: { shouldStream: true, promptPath: PROMPT_PATH }, name: "greet-object" },
    { label: "object non-streaming", ast: OBJECT_AST, options: { shouldStream: false, promptPath: PROMPT_PATH }, name: "greet-object" },
    { label: "image", ast: IMAGE_AST, options: { promptPath: PROMPT_PATH }, name: "greet-image" },
    { label: "speech", ast: SPEECH_AST, options: { promptPath: PROMPT_PATH }, name: "greet-speech" },
  ];

  for (const c of cases) {
    it(`forwards promptPath for ${c.label}`, async () => {
      const { spy, hook } = makeSpyHook();
      const runner = new WebhookRunner(makeClient(), makeExecutor(), {
        promptSpanHook: hook,
      });
      const res: any = await runner.runPrompt(c.ast, c.options);
      await drainIfStream(res);
      // Exact param object — a dropped/renamed/mis-sourced field fails here.
      // commitSha is undefined (these ASTs carry no agentmark_meta).
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        {
          name: c.name,
          promptName: c.name,
          commitSha: undefined,
          promptPath: PROMPT_PATH,
        },
        expect.any(Function)
      );
    });
  }

  it("forwards promptPath: undefined when the options omit it", async () => {
    const { spy, hook } = makeSpyHook();
    const runner = new WebhookRunner(makeClient(), makeExecutor(), {
      promptSpanHook: hook,
    });
    await runner.runPrompt(TEXT_AST, { shouldStream: false });
    const params = spy.mock.calls[0][0] as { promptPath?: string };
    expect(params.promptPath).toBeUndefined();
  });
});
