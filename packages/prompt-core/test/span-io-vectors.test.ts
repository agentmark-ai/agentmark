/**
 * Cross-language span-I/O conformance: drive the WebhookRunner with the
 * pinned cases in `conformance-vectors/vectors/span-io.json` and assert the
 * prompt span receives the contracted `agentmark.input` / `agentmark.output`
 * attributes — and that the span ends at stream drain, never at iterable
 * creation (the early-span-end regression that split model spans into a
 * separate trace).
 *
 * Mirror of `prompt-core-python/tests/test_span_io_vectors.py`. Both suites
 * read the SAME vector file, so a drift in either runner's span-attribute
 * behavior fails loudly in both CI runs.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import type { ExecCtx, ExecutorCapabilities, Executor } from "../src/index";
import { WebhookRunner } from "../src/webhook-runner";
import type {
  PromptSpanHook,
  ExperimentItemSpanHook,
  SpanLike,
} from "../src/span-hook";

const VECTORS = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "..", "conformance-vectors", "vectors", "span-io.json"),
    "utf8"
  )
);

const TEXT_AST = {
  children: [{ type: "yaml", value: "text_config:\n  model_name: test\n" }],
} as any;
const OBJECT_AST = {
  children: [{ type: "yaml", value: "object_config:\n  model_name: test\n" }],
} as any;

/** Executor that replays the vector's events verbatim. */
function replayExecutor(events: any[]): Executor {
  async function* replay() {
    for (const ev of events) yield ev;
  }
  return {
    name: "replay",
    capabilities: (): ExecutorCapabilities => ({
      text: true,
      object: true,
      image: false,
      speech: false,
    }),
    async *executeText(_formatted: unknown, _ctx: ExecCtx) {
      yield* replay();
    },
    async *executeObject(_formatted: unknown, _ctx: ExecCtx) {
      yield* replay();
    },
  };
}

/** Client whose prompts format to the vector's messages. */
function clientWithMessages(messages: unknown[]) {
  const prompt = {
    async format() {
      return { messages };
    },
    async formatWithTestProps() {
      return { messages };
    },
  };
  return {
    getLoader: () => ({}),
    getEvalRegistry: () => undefined,
    loadTextPrompt: async () => prompt,
    loadObjectPrompt: async () => prompt,
  } as any;
}

/** Recording span hook: captures attributes and when the span ended. */
function recordingHook() {
  const attributes: Record<string, string | number> = {};
  const state = { ended: false };
  const hook: PromptSpanHook = async (_params, fn) => {
    const span: SpanLike = {
      traceId: "abc123abc123abc123abc123abc123ab",
      setAttribute: (key, value) => {
        attributes[key] = value;
      },
    };
    try {
      const result = await fn(span);
      return { result, traceId: span.traceId };
    } finally {
      state.ended = true;
    }
  };
  return { hook, attributes, state };
}

async function drain(stream: ReadableStream): Promise<void> {
  const reader = stream.getReader();
  for (;;) {
    const { done } = await reader.read();
    if (done) break;
  }
}

function assertAttributes(
  attributes: Record<string, string | number>,
  expected: {
    input: unknown[];
    output: unknown;
    model: string;
    usage: { input: number; output: number } | null;
    classification: { operationName: string; spanKind: string };
  }
) {
  // Input is always compared as parsed JSON — TS/Python spacing differs.
  expect(attributes["agentmark.input"]).toBeDefined();
  expect(JSON.parse(attributes["agentmark.input"] as string)).toEqual(expected.input);

  if (expected.output === null) {
    expect(attributes["agentmark.output"]).toBeUndefined();
  } else if (typeof expected.output === "string") {
    expect(attributes["agentmark.output"]).toBe(expected.output);
  } else {
    expect(JSON.parse(attributes["agentmark.output"] as string)).toEqual(expected.output);
  }

  // Model is stamped from frontmatter at span start on every path.
  expect(attributes["gen_ai.request.model"]).toBe(expected.model);

  // Usage must be NUMERIC attributes (the normalizer rejects strings).
  if (expected.usage === null) {
    expect(attributes["gen_ai.usage.input_tokens"]).toBeUndefined();
    expect(attributes["gen_ai.usage.output_tokens"]).toBeUndefined();
  } else {
    expect(attributes["gen_ai.usage.input_tokens"]).toBe(expected.usage.input);
    expect(attributes["gen_ai.usage.output_tokens"]).toBe(expected.usage.output);
  }

  // GENERATION classification — required for the Requests view and cost attribution.
  // The runner stamps these before the executor runs, so they're present on every path
  // including error and throw cases. Executors may override gen_ai.request.model via
  // last-write-wins but must NOT override these two (they're runner-owned).
  expect(attributes["gen_ai.operation.name"]).toBe(expected.classification.operationName);
  expect(attributes["agentmark.span.kind"]).toBe(expected.classification.spanKind);
}

describe("span-io conformance vectors", () => {
  for (const c of VECTORS.cases) {
    it(c.name, async () => {
      const { hook, attributes, state } = recordingHook();
      const runner = new WebhookRunner(
        clientWithMessages(c.messages),
        replayExecutor(c.events),
        { promptSpanHook: hook }
      );
      const ast = c.kind === "text" ? TEXT_AST : OBJECT_AST;

      if (c.throws) {
        await expect(
          runner.runPrompt(ast, { shouldStream: c.shouldStream })
        ).rejects.toThrow();
        assertAttributes(attributes, c.expected);
        expect(state.ended).toBe(true);
        return;
      }

      const response = await runner.runPrompt(ast, {
        shouldStream: c.shouldStream,
      });

      if (c.shouldStream) {
        // The span must NOT have ended at hand-back: the model call runs
        // during the drain, and ending early orphans the model spans.
        expect(state.ended).toBe(false);
        await drain((response as any).stream);
        // Drain completion settles the hook callback on a microtask;
        // give it one turn before asserting.
        await new Promise((res) => setTimeout(res, 0));
        expect(state.ended).toBe(true);
      } else {
        expect(state.ended).toBe(true);
      }

      assertAttributes(attributes, c.expected);
    });
  }
});

/** Client whose prompts expose `formatWithDataset` → a single-row stream. */
function clientWithDataset(messages: unknown[], kind: "text" | "object") {
  const prompt = {
    async formatWithDataset() {
      return new ReadableStream({
        start(controller) {
          controller.enqueue({
            type: kind,
            formatted: { messages },
            dataset: { input: {}, expected_output: undefined },
            evals: [],
          });
          controller.close();
        },
      });
    },
  };
  return {
    getLoader: () => ({}),
    getEvalRegistry: () => undefined,
    loadTextPrompt: async () => prompt,
    loadObjectPrompt: async () => prompt,
  } as any;
}

/** Recording experiment-item span hook: captures the item span's attributes. */
function recordingExperimentHook() {
  const attributes: Record<string, string | number> = {};
  const hook: ExperimentItemSpanHook = async (_params, fn) => {
    const span: SpanLike = {
      traceId: "abc123abc123abc123abc123abc123ab",
      setAttribute: (key, value) => {
        attributes[key] = value;
      },
    };
    const result = await fn(span);
    return { result, traceId: span.traceId };
  };
  return { hook, attributes };
}

/**
 * The experiment path (`runExperiment`) must record the SAME prompt-span I/O on
 * each item span as the run-prompt path — most critically `agentmark.input`
 * (the rendered messages), so a failed eval row shows the real
 * system/user/assistant turns the model received, not just the dataset props.
 * Drive each clean vector case through `runExperiment` with a one-row dataset
 * and assert the item span carries the contracted attributes. Error/throw cases
 * are excluded: the experiment path catches and rides errors on the wire (it
 * does not re-raise like runPrompt), so their span-end semantics differ.
 */
describe("span-io conformance vectors — experiment item span", () => {
  const cleanCases = VECTORS.cases.filter(
    (c: any) => !c.throws && !c.events.some((e: any) => e.type === "error")
  );
  for (const c of cleanCases) {
    it(c.name, async () => {
      const { hook, attributes } = recordingExperimentHook();
      const runner = new WebhookRunner(
        clientWithDataset(c.messages, c.kind),
        replayExecutor(c.events),
        { experimentItemSpanHook: hook }
      );
      const ast = c.kind === "text" ? TEXT_AST : OBJECT_AST;
      const response = await runner.runExperiment(ast, "run-conformance");
      await drain((response as any).stream);
      assertAttributes(attributes, c.expected);
    });
  }
});
