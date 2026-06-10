/**
 * Prompt-version trace linking — WebhookRunner → PromptSpanHook params.
 *
 * The gateway / CLI dev server stamp `agentmark_meta.commit_sha` (the commit
 * the prompt content was served at) into the AST frontmatter. These tests pin
 * that ALL prompt-run paths (text/object × streaming/non-streaming, image,
 * speech — the 6 promptSpanHook call sites) forward BOTH `promptName` and
 * `commitSha` to the hook, and that null-hook behavior is unchanged.
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

const META_YAML = 'agentmark_meta:\n  commit_sha: "abc123def456"\n';

const TEXT_AST = {
  children: [
    {
      type: "yaml",
      value: `name: greet-text\ntext_config:\n  model_name: test\n${META_YAML}`,
    },
  ],
} as any;
const OBJECT_AST = {
  children: [
    {
      type: "yaml",
      value: `name: greet-object\nobject_config:\n  model_name: test\n${META_YAML}`,
    },
  ],
} as any;
const IMAGE_AST = {
  children: [
    {
      type: "yaml",
      value: `name: greet-image\nimage_config:\n  model_name: test\n${META_YAML}`,
    },
  ],
} as any;
const SPEECH_AST = {
  children: [
    {
      type: "yaml",
      value: `name: greet-speech\nspeech_config:\n  model_name: test\n${META_YAML}`,
    },
  ],
} as any;
const TEXT_AST_NO_META = {
  children: [
    { type: "yaml", value: "name: greet-text\ntext_config:\n  model_name: test\n" },
  ],
} as any;

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
    async *executeText(_formatted: unknown, _ctx: ExecCtx): AsyncIterable<TextStreamEvent> {
      yield { type: "text-delta", text: "hi" };
      yield { type: "finish", reason: "stop" };
    },
    async *executeObject(_formatted: unknown, _ctx: ExecCtx): AsyncIterable<ObjectStreamEvent> {
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
  const spy = vi.fn(async (params: any, fn: (span: SpanLike) => Promise<any>) => {
    const result = await fn(stub);
    return { result, traceId: stub.traceId };
  });
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

describe("WebhookRunner — promptSpanHook receives promptName + commitSha", () => {
  // Parameterized over all 6 promptSpanHook call sites.
  const cases: Array<{
    label: string;
    ast: any;
    options: any;
    expected: { name: string; promptName: string; commitSha: string };
  }> = [
    {
      label: "text streaming",
      ast: TEXT_AST,
      options: { shouldStream: true },
      expected: { name: "greet-text", promptName: "greet-text", commitSha: "abc123def456" },
    },
    {
      label: "text non-streaming",
      ast: TEXT_AST,
      options: { shouldStream: false },
      expected: { name: "greet-text", promptName: "greet-text", commitSha: "abc123def456" },
    },
    {
      label: "object streaming",
      ast: OBJECT_AST,
      options: { shouldStream: true },
      expected: { name: "greet-object", promptName: "greet-object", commitSha: "abc123def456" },
    },
    {
      label: "object non-streaming",
      ast: OBJECT_AST,
      options: { shouldStream: false },
      expected: { name: "greet-object", promptName: "greet-object", commitSha: "abc123def456" },
    },
    {
      label: "image",
      ast: IMAGE_AST,
      options: {},
      expected: { name: "greet-image", promptName: "greet-image", commitSha: "abc123def456" },
    },
    {
      label: "speech",
      ast: SPEECH_AST,
      options: {},
      expected: { name: "greet-speech", promptName: "greet-speech", commitSha: "abc123def456" },
    },
  ];

  for (const c of cases) {
    it(`passes name + promptName + commitSha for ${c.label}`, async () => {
      const { spy, hook } = makeSpyHook();
      const runner = new WebhookRunner(makeClient(), makeExecutor(), {
        promptSpanHook: hook,
      });
      const res: any = await runner.runPrompt(c.ast, c.options);
      await drainIfStream(res);
      // Exact param object — a dropped/renamed field fails here.
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        {
          name: c.expected.name,
          promptName: c.expected.promptName,
          commitSha: c.expected.commitSha,
        },
        expect.any(Function),
      );
    });
  }

  it("passes commitSha: undefined when the AST carries no agentmark_meta", async () => {
    const { spy, hook } = makeSpyHook();
    const runner = new WebhookRunner(makeClient(), makeExecutor(), {
      promptSpanHook: hook,
    });
    await runner.runPrompt(TEXT_AST_NO_META, { shouldStream: false });
    expect(spy).toHaveBeenCalledWith(
      { name: "greet-text", promptName: "greet-text", commitSha: undefined },
      expect.any(Function),
    );
  });

  it("null-hook behavior unchanged: no hook → result intact, traceId omitted", async () => {
    const runner = new WebhookRunner(makeClient(), makeExecutor());
    const res: any = await runner.runPrompt(TEXT_AST, { shouldStream: false });
    expect(res.result).toBe("hi");
    // Null hooks yield traceId "" which the envelope omits entirely.
    expect("traceId" in res).toBe(false);
  });
});
