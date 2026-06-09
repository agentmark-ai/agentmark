/**
 * Byte-equality gate for the v4 adapter. See v5-adapter's equivalent file
 * for rationale. Snapshots live in test/__snapshots__/runner.snapshot.test.ts.snap.
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { fileURLToPath } from "url";
import path from "path";
import type { EvalRegistry } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { VercelAdapterWebhookHandler } from "../src/runner";
import type { Ast } from "@agentmark-ai/templatedx";
import { createAgentMarkClient, VercelAIModelRegistry } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

vi.mock("ai", async () => {
  return {
    jsonSchema: (s: any) => s,
    generateText: vi.fn(async (_input: any) => ({
      text: "TEXT",
      usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
      finishReason: "stop",
      steps: [],
    })),
    generateObject: vi.fn(async (_input: any) => ({
      object: { ok: true },
      usage: { promptTokens: 5, completionTokens: 10, totalTokens: 15 },
      finishReason: "stop",
    })),
    experimental_generateImage: vi.fn(async (_input: any) => ({
      images: [{ mediaType: "image/png", base64: "iVBORw0KGgo=" }],
    })),
    experimental_generateSpeech: vi.fn(async (_input: any) => ({
      audio: { mediaType: "audio/mpeg", base64: "base64audio", format: "mp3" },
    })),
    streamText: vi.fn((_input: any) => ({
      fullStream: (async function* () {
        yield { type: "text-delta", textDelta: "TEXT" };
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 3, completionTokens: 7, totalTokens: 10 },
        };
      })(),
    })),
    streamObject: vi.fn((_input: any) => ({
      usage: Promise.resolve({ promptTokens: 5, completionTokens: 10, totalTokens: 15 }),
      fullStream: (async function* () {
        yield { type: "object", object: { ok: true } };
      })(),
    })),
    Output: { object: (x: any) => x },
  } as any;
});

async function drainStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  let out = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += typeof value === "string" ? value : new TextDecoder().decode(value);
  }
  return out;
}

describe("v4 VercelAdapterWebhookHandler wire format (byte-equality)", () => {
  let runner: VercelAdapterWebhookHandler;
  let loader: FileLoader;

  beforeAll(async () => {
    await setupFixtures();
  });
  afterAll(() => cleanupFixtures());

  beforeEach(() => {
    vi.clearAllMocks();
    const evals: EvalRegistry = {
      exact_match: async ({ output, expectedOutput }) => {
        const out = typeof output === "string" ? output : JSON.stringify(output);
        const exp =
          typeof expectedOutput === "string"
            ? expectedOutput
            : JSON.stringify(expectedOutput);
        const isMatch = out === exp;
        return {
          score: isMatch ? 1 : 0,
          label: isMatch ? "correct" : "incorrect",
          reason: isMatch ? "match" : "no match",
          passed: isMatch,
        };
      },
    };
    const base = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "fixtures"
    );
    loader = new FileLoader(base);
    const modelRegistry = new VercelAIModelRegistry();
    modelRegistry.registerModels("test-model", () => ({}) as any);
    const client = createAgentMarkClient({
      loader,
      modelRegistry,
      evalRegistry: evals,
    });
    runner = new VercelAdapterWebhookHandler(client);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "mock-uuid") } as any);
  });
  afterEach(() => vi.restoreAllMocks());

  function stabilize(result: unknown): unknown {
    const s = JSON.stringify(result);
    return JSON.parse(
      s.replace(/"traceId":"[^"]+"/g, '"traceId":"<TRACE_ID>"')
    );
  }

  function stabilizeString(s: string): string {
    return s.replace(/"traceId":"[^"]+"/g, '"traceId":"<TRACE_ID>"');
  }

  it("text non-streaming", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect(stabilize(res)).toMatchSnapshot();
  });

  it("dispatch answers get-evals from the client's registry", async () => {
    const res = await runner.dispatch({ type: "get-evals", data: {} });
    expect(res).toEqual({
      type: "json",
      data: { type: "evals", result: '["exact_match"]', traceId: "" },
      status: 200,
    });
  });

  it("object non-streaming", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: false });
    expect(stabilize(res)).toMatchSnapshot();
  });

  it("image", async () => {
    const ast = (await loader.load("image.prompt.mdx", "image")) as Ast;
    const res = await runner.runPrompt(ast);
    expect(stabilize(res)).toMatchSnapshot();
  });

  it("speech", async () => {
    const ast = (await loader.load("speech.prompt.mdx", "speech")) as Ast;
    const res = await runner.runPrompt(ast);
    expect(stabilize(res)).toMatchSnapshot();
  });

  it("text streaming — NDJSON bytes", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: true });
    const stream = (res as any).stream as ReadableStream;
    const ndjson = stabilizeString(await drainStream(stream));
    expect(ndjson).toMatchSnapshot();
  });

  it("object streaming — NDJSON bytes", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const res = await runner.runPrompt(ast, { shouldStream: true });
    const stream = (res as any).stream as ReadableStream;
    const ndjson = stabilizeString(await drainStream(stream));
    expect(ndjson).toMatchSnapshot();
  });

  it("experiment text — NDJSON bytes", async () => {
    const ast = (await loader.load("text.prompt.mdx", "text")) as Ast;
    const { stream } = await runner.runExperiment(ast, "run-snapshot");
    const ndjson = stabilizeString(await drainStream(stream as ReadableStream));
    expect(ndjson).toMatchSnapshot();
  });

  it("experiment object — NDJSON bytes", async () => {
    const ast = (await loader.load("math.prompt.mdx", "object")) as Ast;
    const { stream } = await runner.runExperiment(ast, "run-snapshot");
    const ndjson = stabilizeString(await drainStream(stream as ReadableStream));
    expect(ndjson).toMatchSnapshot();
  });
});
