import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import { createHash } from "node:crypto";

import type { AgentMark } from "./agentmark";
import type { PromptShape, Adapter } from "./types";
import type {
  WebhookPromptResponse,
  WebhookDatasetResponse,
} from "./runner";
import { createPromptTelemetry } from "./runner";
import { runDatasetPool, experimentErrorChunk } from "./experiment";
import {
  wireJson,
  textEventToWire,
  objectEventToWire,
  datasetRowToWire,
  textResponseToWire,
  objectResponseToWire,
} from "./wire";
import type { AgentEvent, Executor, ExecCtx } from "./executor";
import type {
  AgentMarkObservation,
  AgentMarkToolInvocation,
  ObservationHook,
} from "./observation";
import type {
  ExperimentItemSpanHook,
  PromptSpanHook,
  SpanLike,
} from "./span-hook";
import {
  nullExperimentItemSpanHook,
  nullPromptSpanHook,
} from "./span-hook";

type Frontmatter = {
  name?: string;
  text_config?: unknown;
  object_config?: unknown;
  image_config?: unknown;
  speech_config?: unknown;
  test_settings?: { dataset?: string; evals?: string[] };
};

export interface RunPromptOptions {
  shouldStream?: boolean;
  customProps?: Record<string, any>;
  telemetry?: { isEnabled: boolean; metadata?: Record<string, any> };
  signal?: AbortSignal;
}

/**
 * Options for {@link WebhookRunner.runExperiment}. An options bag (mirroring
 * `RunPromptOptions`) rather than 5+ positional args — additive, hard to
 * misorder, and lets cancellation (`signal`) be passed without a positional
 * break.
 */
export interface RunExperimentOptions {
  /** Override the dataset path (defaults to the prompt's `test_settings.dataset`). */
  datasetPath?: string;
  /** Row sampling spec forwarded to `formatWithDataset`. */
  sampling?: Record<string, unknown>;
  /** Max concurrent rows (defaults to `DEFAULT_EXPERIMENT_CONCURRENCY`). */
  concurrency?: number;
  /** Stable experiment identity for the regression-gate baseline resolver. */
  experimentKey?: string;
  /** Source-tree hash the run is tagged with, for baseline attribution. */
  sourceTreeHash?: string;
  /** Telemetry seed (mirrors `RunPromptOptions`). Threaded into each row's
   * `formatWithDataset` so the adapter authors `experimental_telemetry` per
   * row — without it the AI SDK emits no generation span for experiments. */
  telemetry?: { isEnabled: boolean; metadata?: Record<string, any> };
  /** Cancellation: when it fires, the pool stops dispatching new rows and
   * in-flight rows abort their SDK calls (threaded into each row's ExecCtx). */
  signal?: AbortSignal;
}

/**
 * Canonical dataset item name — 12-char md5 of the sorted-keys JSON of the
 * input, falling back to the raw index when there's nothing to hash. Same
 * formula as prompt-core-python (`json.dumps(sort_keys=True,
 * separators=(",",":"))` with the default `ensure_ascii=True`) so re-runs of
 * the same dataset keep identical item identity across both language SDKs —
 * including non-ASCII input (escaped to `\uXXXX` to match Python; see
 * {@link escapeNonAscii}).
 *
 * Known cross-language edge: whole-number floats. JS cannot distinguish `1.0`
 * from `1` (both parse to `number`), so a dataset row `{"x":1.0}` hashes as
 * `{"x":1}` here but `{"x":1.0}` in Python. Datasets should not rely on
 * float-vs-int identity for item naming.
 *
 * The single canonical implementation — the claude-agent adapter and the
 * cross-language parity tests import this; do not fork it.
 */
export function computeDatasetItemName(datasetInput: unknown, index: number): string {
  if (datasetInput == null || datasetInput === "") return `${index}`;
  if (typeof datasetInput === "object") {
    const keys = Object.keys(datasetInput as Record<string, unknown>);
    if (keys.length === 0 && !Array.isArray(datasetInput)) return `${index}`;
  }
  let digestInput: string;
  try {
    digestInput = escapeNonAscii(stableStringify(datasetInput));
  } catch {
    return `${index}`;
  }
  return createHash("md5").update(digestInput).digest("hex").slice(0, 12);
}

/** JSON.stringify with sorted object keys — matches Python's
 * json.dumps(..., sort_keys=True) so the md5 digest agrees cross-language. */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stableStringify).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

/** Escape every non-ASCII code unit to `\uXXXX`, reproducing Python
 * `json.dumps`'s default `ensure_ascii=True`. JS strings are UTF-16, so chars
 * above the BMP are already two surrogate code units — each escaped
 * individually, exactly as Python emits its surrogate pair. Without this the
 * md5 digest diverges from the Python SDK for any non-ASCII dataset input. */
function escapeNonAscii(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    out += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : s[i];
  }
  return out;
}

function extractErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as Record<string, any>;
    return (
      e.message ||
      e.error?.message ||
      e.data?.error?.message ||
      JSON.stringify(error)
    );
  }
  return String(error);
}

// usageToWire / textEventToWire / objectEventToWire live in ./wire — the
// event→chunk mapping is a pure function so the shared conformance vectors
// (wire-chunks.json) can pin it against the Python runner's mirror.

/**
 * Generic webhook runner — consumes an Executor, emits the canonical
 * NDJSON / WebhookPromptResponse wire format. Replaces the per-adapter
 * `*WebhookHandler` classes. Byte-compatible with the previous v5 handler
 * so downstream cloud + dashboard consumers see no change.
 */
export interface WebhookRunnerHooks {
  /**
   * Called once per `runPrompt` invocation. Adapters wire their OTEL
   * library's `span()` helper through here; the shared runner only cares
   * about the resulting `{ result, traceId }` tuple. Omit to opt out of
   * prompt-level tracing (returns `traceId: ""`).
   */
  promptSpanHook?: PromptSpanHook;
  /**
   * Called once per dataset item during `runExperiment`. Same shape as
   * `promptSpanHook`; the extra `ExperimentItemParams` fields carry
   * dataset metadata the adapter's span integration wants (runId, item
   * name, expected output, commit sha). Omit to opt out of per-item
   * tracing — each dataset chunk's `traceId` will be absent.
   */
  experimentItemSpanHook?: ExperimentItemSpanHook;
  /**
   * Called once per completed executor invocation (prompt run + each
   * dataset item in experiments) with an `AgentMarkObservation` summary.
   * Complement to the live AgentEvent stream: use this for OTel-GenAI
   * exporters, cost analytics, or any post-hoc consumer that doesn't
   * need chunk timing. Omit to skip observation synthesis.
   */
  observationHook?: ObservationHook;
}

export class WebhookRunner<
  T extends PromptShape<T> = PromptShape<Record<string, never>>,
  A extends Adapter<T> = Adapter<T>
> {
  private readonly promptSpanHook: PromptSpanHook;
  private readonly experimentItemSpanHook: ExperimentItemSpanHook;
  private readonly observationHook: ObservationHook | undefined;

  constructor(
    private readonly client: AgentMark<T, A>,
    private readonly executor: Executor,
    hooks?: WebhookRunnerHooks
  ) {
    this.promptSpanHook = hooks?.promptSpanHook ?? nullPromptSpanHook;
    this.experimentItemSpanHook =
      hooks?.experimentItemSpanHook ?? nullExperimentItemSpanHook;
    this.observationHook = hooks?.observationHook;
  }

  /** Synthesize an `AgentMarkObservation` from a drained event stream.
   * Called internally by the runner — external consumers don't call this. */
  private buildObservation(args: {
    kind: AgentMarkObservation["kind"];
    events: readonly AgentEvent[];
    promptName?: string;
    traceId?: string;
    durationMs?: number;
    finalOutput?: string | unknown;
  }): AgentMarkObservation {
    const toolCallsById = new Map<string, AgentMarkToolInvocation>();
    let usage: AgentMarkObservation["usage"];
    let finishReason: string | undefined;
    let error: string | undefined;
    let streamedText = "";
    let objectFinal: unknown;

    for (const ev of args.events) {
      switch (ev.type) {
        case "text-delta":
          streamedText += ev.text;
          break;
        case "object-final":
          objectFinal = ev.value;
          break;
        case "tool-call":
          toolCallsById.set(ev.id, {
            id: ev.id,
            name: ev.name,
            input: ev.args,
          });
          break;
        case "tool-result": {
          const prior = toolCallsById.get(ev.id);
          toolCallsById.set(ev.id, {
            id: ev.id,
            name: prior?.name ?? ev.name,
            input: prior?.input,
            output: ev.result,
            ...(ev.isError ? { error: String(ev.result) } : {}),
          });
          break;
        }
        case "finish":
          finishReason = ev.reason;
          if (ev.usage)
            usage = ev.usage as AgentMarkObservation["usage"];
          break;
        case "error":
          error = ev.error;
          finishReason = finishReason ?? "error";
          break;
      }
    }

    const output =
      args.finalOutput !== undefined
        ? args.finalOutput
        : args.kind === "object"
          ? objectFinal
          : streamedText || undefined;

    return {
      executorName: this.executor.name,
      promptName: args.promptName,
      kind: args.kind,
      output,
      toolCalls: Array.from(toolCallsById.values()),
      usage,
      finishReason,
      error,
      durationMs: args.durationMs,
      traceId: args.traceId,
    };
  }

  private async emitObservation(
    build: () => AgentMarkObservation
  ): Promise<void> {
    if (!this.observationHook) return;
    try {
      await this.observationHook(build());
    } catch {
      // observations are best-effort; never let a hook failure propagate
      // and break the underlying run
    }
  }

  async runPrompt(
    promptAst: Ast,
    options?: RunPromptOptions
  ): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const { telemetry } = createPromptTelemetry(
      frontmatter.name,
      options?.telemetry
    );

    if (frontmatter.object_config) {
      return this.runObject(promptAst, frontmatter, telemetry, options);
    }
    if (frontmatter.text_config) {
      return this.runText(promptAst, frontmatter, telemetry, options);
    }
    if (frontmatter.image_config) {
      return this.runImage(promptAst, frontmatter, telemetry, options);
    }
    if (frontmatter.speech_config) {
      return this.runSpeech(promptAst, frontmatter, telemetry, options);
    }
    throw new Error("Invalid prompt");
  }

  private async runText(
    promptAst: Ast,
    frontmatter: Frontmatter,
    telemetry: RunPromptOptions["telemetry"],
    options: RunPromptOptions | undefined
  ): Promise<WebhookPromptResponse> {
    const prompt = await this.client.loadTextPrompt(promptAst);
    const input = options?.customProps
      ? await prompt.format({ props: options.customProps, telemetry })
      : await prompt.formatWithTestProps({ telemetry });
    const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
    const spanName = frontmatter.name || "prompt-run";

    if (shouldStream) {
      const { result: eventsPromise, traceId } = await this.promptSpanHook(
        { name: spanName, promptName: frontmatter.name },
        async (ctx: SpanLike) => {
          const ctxExec: ExecCtx = {
            telemetry,
            signal: options?.signal,
            span: ctx,
            promptName: frontmatter.name,
            shouldStream,
          };
          return this.executor.executeText(input, ctxExec);
        }
      );

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            const events = await eventsPromise;
            for await (const ev of events) {
              // Pure event→chunk mapping lives in ./wire, pinned by the
              // shared wire-chunks.json golden vectors that the Python
              // runner's mirror also runs. Terminal handling stays here.
              const chunk = textEventToWire(ev);
              if (ev.type === "error") {
                console.error("[WebhookRunner] Error during streaming:", ev.error);
                controller.enqueue(encoder.encode(wireJson(chunk!)));
                controller.close();
                return;
              }
              if (chunk) controller.enqueue(encoder.encode(wireJson(chunk)));
            }
          } catch (err) {
            const message = extractErrorMessage(err);
            console.error("[WebhookRunner] Error during streaming:", message);
            controller.enqueue(
              encoder.encode(wireJson({ type: "error", error: message }))
            );
          }
          controller.close();
        },
      });

      return {
        type: "stream",
        stream,
        streamHeader: { "AgentMark-Streaming": "true" },
        traceId,
      } as WebhookPromptResponse;
    }

    // Non-streaming: collect events into a single text response.
    let text = "";
    let usage: any;
    let finishReason: string | undefined;
    const toolCalls: any[] = [];
    const toolResults: any[] = [];
    // Collect every event for post-hoc AgentMarkObservation synthesis.
    const collected: AgentEvent[] = [];
    const startTime = Date.now();

    const { result: eventsPromise, traceId } = await this.promptSpanHook(
      { name: spanName, promptName: frontmatter.name },
      async (ctx: SpanLike) => {
        const ctxExec: ExecCtx = {
          telemetry,
          signal: options?.signal,
          span: ctx,
          promptName: frontmatter.name,
          shouldStream: false,
        };
        return this.executor.executeText(input, ctxExec);
      }
    );

    const events = await eventsPromise;
    let caughtError: Error | undefined;
    for await (const ev of events) {
      collected.push(ev);
      if (ev.type === "text-delta") text += ev.text;
      else if (ev.type === "tool-call")
        toolCalls.push({
          toolCallId: ev.id,
          toolName: ev.name,
          args: ev.args,
        });
      else if (ev.type === "tool-result")
        toolResults.push({
          toolCallId: ev.id,
          toolName: ev.name,
          result: ev.result,
        });
      else if (ev.type === "finish") {
        finishReason = ev.reason;
        if (ev.usage) usage = ev.usage;
      } else if (ev.type === "error") {
        caughtError = new Error(ev.error);
      }
    }

    // Emit observation BEFORE throwing so consumers see failures too.
    await this.emitObservation(() =>
      this.buildObservation({
        kind: "text",
        events: collected,
        promptName: frontmatter.name,
        traceId,
        durationMs: Date.now() - startTime,
        finalOutput: text || undefined,
      })
    );
    if (caughtError) throw caughtError;

    // Envelope assembly is the pure textResponseToWire (./wire), pinned by
    // the shared response-envelopes.json golden vectors that the Python
    // runner's mirror also runs. Note traceId is now omitted when empty
    // (null hooks) instead of riding as "" — consumers probe by key.
    return textResponseToWire({
      result: text,
      usage,
      finishReason,
      toolCalls,
      toolResults,
      traceId,
    }) as WebhookPromptResponse;
  }

  private async runObject(
    promptAst: Ast,
    frontmatter: Frontmatter,
    telemetry: RunPromptOptions["telemetry"],
    options: RunPromptOptions | undefined
  ): Promise<WebhookPromptResponse> {
    const prompt = await this.client.loadObjectPrompt(promptAst);
    const input = options?.customProps
      ? await prompt.format({ props: options.customProps, telemetry })
      : await prompt.formatWithTestProps({ telemetry });
    const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
    const spanName = frontmatter.name || "prompt-run";

    if (shouldStream) {
      const { result: eventsPromise, traceId } = await this.promptSpanHook(
        { name: spanName, promptName: frontmatter.name },
        async (ctx: SpanLike) => {
          const ctxExec: ExecCtx = {
            telemetry,
            signal: options?.signal,
            span: ctx,
            promptName: frontmatter.name,
            shouldStream,
          };
          return this.executor.executeObject(input, ctxExec);
        }
      );

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            const events = await eventsPromise;
            for await (const ev of events) {
              // Pure event→chunk mapping lives in ./wire, pinned by the
              // shared wire-chunks.json golden vectors that the Python
              // runner's mirror also runs: usage-less finish emits nothing,
              // object-final emits a "result" chunk so non-streaming
              // dashboards see the final object.
              const chunk = objectEventToWire(ev);
              if (ev.type === "error") {
                console.error("[WebhookRunner] Error during streaming:", ev.error);
                controller.enqueue(encoder.encode(wireJson(chunk!)));
                controller.close();
                return;
              }
              if (chunk) controller.enqueue(encoder.encode(wireJson(chunk)));
            }
          } catch (err) {
            const message = extractErrorMessage(err);
            console.error("[WebhookRunner] Error during streaming:", message);
            controller.enqueue(
              encoder.encode(wireJson({ type: "error", error: message }))
            );
          }
          controller.close();
        },
      });

      return {
        type: "stream",
        stream,
        streamHeader: { "AgentMark-Streaming": "true" },
        traceId,
      } as WebhookPromptResponse;
    }

    // Non-streaming: wait for object-final.
    let value: unknown = undefined;
    let usage: any;
    let finishReason: string | undefined;
    const collected: AgentEvent[] = [];
    const startTime = Date.now();

    const { result: eventsPromise, traceId } = await this.promptSpanHook(
      { name: spanName, promptName: frontmatter.name },
      async (ctx: SpanLike) => {
        const ctxExec: ExecCtx = {
          telemetry,
          signal: options?.signal,
          span: ctx,
          promptName: frontmatter.name,
          shouldStream: false,
        };
        return this.executor.executeObject(input, ctxExec);
      }
    );

    const events = await eventsPromise;
    let caughtError: Error | undefined;
    for await (const ev of events) {
      collected.push(ev);
      if (ev.type === "object-final") value = ev.value;
      else if (ev.type === "object-delta") value = ev.partial;
      else if (ev.type === "finish") {
        finishReason = ev.reason;
        if (ev.usage) usage = ev.usage;
      } else if (ev.type === "error") {
        caughtError = new Error(ev.error);
      }
    }

    await this.emitObservation(() =>
      this.buildObservation({
        kind: "object",
        events: collected,
        promptName: frontmatter.name,
        traceId,
        durationMs: Date.now() - startTime,
        finalOutput: value,
      })
    );
    if (caughtError) throw caughtError;

    // See runText — vector-pinned envelope assembly.
    return objectResponseToWire({
      result: value,
      usage,
      finishReason,
      traceId,
    }) as WebhookPromptResponse;
  }

  private async runImage(
    promptAst: Ast,
    frontmatter: Frontmatter,
    telemetry: RunPromptOptions["telemetry"],
    options: RunPromptOptions | undefined
  ): Promise<WebhookPromptResponse> {
    const executeImage = this.executor.executeImage?.bind(this.executor);
    if (!executeImage || !this.executor.capabilities().image) {
      throw new Error(
        `Executor '${this.executor.name}' does not support image prompts.`
      );
    }
    const prompt = await this.client.loadImagePrompt(promptAst);
    const input = options?.customProps
      ? await prompt.format({ props: options.customProps, telemetry })
      : await prompt.formatWithTestProps({ telemetry });
    const spanName = frontmatter.name || "prompt-run";

    const { result, traceId } = await this.promptSpanHook(
      { name: spanName, promptName: frontmatter.name },
      async (ctx: SpanLike) => {
        const ctxExec: ExecCtx = {
          telemetry,
          signal: options?.signal,
          span: ctx,
          promptName: frontmatter.name,
        };
        return executeImage(input, ctxExec);
      }
    );
    return { ...(await result), traceId } as WebhookPromptResponse;
  }

  private async runSpeech(
    promptAst: Ast,
    frontmatter: Frontmatter,
    telemetry: RunPromptOptions["telemetry"],
    options: RunPromptOptions | undefined
  ): Promise<WebhookPromptResponse> {
    const executeSpeech = this.executor.executeSpeech?.bind(this.executor);
    if (!executeSpeech || !this.executor.capabilities().speech) {
      throw new Error(
        `Executor '${this.executor.name}' does not support speech prompts.`
      );
    }
    const prompt = await this.client.loadSpeechPrompt(promptAst);
    const input = options?.customProps
      ? await prompt.format({ props: options.customProps, telemetry })
      : await prompt.formatWithTestProps({ telemetry });
    const spanName = frontmatter.name || "prompt-run";

    const { result, traceId } = await this.promptSpanHook(
      { name: spanName, promptName: frontmatter.name },
      async (ctx: SpanLike) => {
        const ctxExec: ExecCtx = {
          telemetry,
          signal: options?.signal,
          span: ctx,
          promptName: frontmatter.name,
        };
        return executeSpeech(input, ctxExec);
      }
    );
    return { ...(await result), traceId } as WebhookPromptResponse;
  }

  async runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    options?: RunExperimentOptions
  ): Promise<WebhookDatasetResponse> {
    const {
      datasetPath,
      sampling,
      concurrency,
      experimentKey,
      sourceTreeHash,
      signal,
    } = options ?? {};
    const loader = this.client.getLoader();
    if (!loader) throw new Error("Loader not found");

    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const experimentRunId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const evalRegistry = this.client.getEvalRegistry();
    const resolvedDatasetPath =
      datasetPath ?? frontmatter?.test_settings?.dataset;

    // Enable telemetry per row (mirrors runPrompt). formatWithDataset spreads
    // these options into each row's format(), where the adapter authors
    // `experimental_telemetry`. Omitting this is why experiments produced no
    // generation span while run-prompt did.
    const { telemetry } = createPromptTelemetry(
      frontmatter?.name,
      options?.telemetry
    );

    const executor = this.executor;
    const experimentItemSpanHook = this.experimentItemSpanHook;

    const runTextOrObject = async (kind: "text" | "object") => {
      const prompt =
        kind === "text"
          ? await this.client.loadTextPrompt(promptAst)
          : await this.client.loadObjectPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({
        datasetPath: resolvedDatasetPath,
        ...(sampling ? { sampling } : {}),
        telemetry,
      });

      const stream = new ReadableStream({
        async start(controller) {
          // `dataset`'s reader type is a text|object union here (the prompt
          // kind is chosen at runtime), which the generic pool can't unify —
          // erase to `any`, the row body re-narrows via `item.type`.
          const reader =
            dataset.getReader() as ReadableStreamDefaultReader<any>;
          await runDatasetPool(
            reader,
            async (item, index) => {
              if (item.type === "error") {
                // Surface dataset-row parse errors (e.g. a row missing the
                // `input` wrapper) instead of silently dropping them —
                // otherwise an all-invalid dataset produces zero output and
                // exits 0, reading as a false pass.
                controller.enqueue(experimentErrorChunk(item.error));
                return;
              }
              const formatted = item.formatted as unknown;
              try {
                const { result: outputTuple, traceId } =
                  await experimentItemSpanHook(
                    {
                      index,
                      promptName: frontmatter.name,
                      datasetRunName,
                      experimentRunId,
                      datasetItemName: computeDatasetItemName(
                        item.dataset?.input,
                        index
                      ),
                      datasetInput: item.dataset?.input,
                      datasetExpectedOutput: item.dataset?.expected_output,
                      datasetPath: resolvedDatasetPath,
                      experimentKey,
                      sourceTreeHash,
                    },
                    async (ctx: SpanLike) => {
                      if (item.dataset?.input != null) {
                        try {
                          ctx.setAttribute(
                            "agentmark.props",
                            JSON.stringify(item.dataset.input)
                          );
                        } catch {
                          /* ignore */
                        }
                      }
                      const ctxExec: ExecCtx = {
                        telemetry: { isEnabled: true },
                        span: ctx,
                        promptName: frontmatter.name,
                        shouldStream: false,
                        signal,
                      };
                      const events =
                        kind === "text"
                          ? executor.executeText(formatted, ctxExec)
                          : executor.executeObject(formatted, ctxExec);

                      let textBuf = "";
                      let objectFinal: unknown;
                      let usageCap: any;
                      for await (const ev of events) {
                        if (ev.type === "text-delta") textBuf += ev.text;
                        else if (ev.type === "object-final")
                          objectFinal = ev.value;
                        else if (ev.type === "object-delta")
                          objectFinal = ev.partial;
                        else if (ev.type === "finish") {
                          if (ev.usage) usageCap = ev.usage;
                        } else if (ev.type === "error") {
                          // Throw so the wrapper span records ERROR status
                          // (no green-check on a failed run, per #2367) and
                          // the row surfaces as an error chunk via the catch.
                          throw new Error(ev.error);
                        }
                      }
                      const output = kind === "text" ? textBuf : objectFinal;
                      try {
                        const outStr =
                          typeof output === "string"
                            ? output
                            : JSON.stringify(output);
                        ctx.setAttribute("agentmark.output", outStr);
                      } catch {
                        /* ignore */
                      }
                      return { output, usage: usageCap };
                    }
                  );

                const { output, usage } = outputTuple;

                let evalResults: any[] = [];
                const scoreNames = item.evals ?? [];
                if (
                  evalRegistry &&
                  Array.isArray(scoreNames) &&
                  scoreNames.length > 0
                ) {
                  const evaluators = scoreNames
                    .map((name: string) => {
                      if (!(name in evalRegistry)) return undefined;
                      return { name, fn: evalRegistry[name] };
                    })
                    .filter(Boolean) as Array<{ name: string; fn: any }>;
                  evalResults = await Promise.all(
                    evaluators.map(async (e) => {
                      const r = await e.fn({
                        // Adapters expose the compiled messages on their
                        // formatted payload (Mastra/claude: `.messages`) —
                        // that's the eval's `input`.
                        input: (formatted as any)?.messages,
                        output,
                        expectedOutput: item.dataset?.expected_output,
                      });
                      return { name: e.name, ...r };
                    })
                  );
                }

                // Standardized field order across text + object experiments:
                // {type, result, traceId, runId, runName}. This matches v4's
                // legacy ordering and v5's legacy text ordering; it flattens
                // the v5 object-legacy quirk (which had traceId last) in favor
                // of consistency. Downstream JSON consumers are order-agnostic.
                // Row assembly is the pure datasetRowToWire (./wire), pinned
                // by the shared dataset-rows.json golden vectors that the
                // Python runner's mirror also runs.
                const chunk = wireJson(
                  datasetRowToWire({
                    input: item.dataset?.input,
                    expectedOutput: item.dataset?.expected_output,
                    actualOutput: output,
                    tokens: usage?.totalTokens,
                    evals: evalResults,
                    traceId,
                    runId: experimentRunId,
                    runName: datasetRunName,
                  })
                );
                controller.enqueue(chunk);
              } catch (err) {
                controller.enqueue(experimentErrorChunk(err));
              }
            },
            concurrency,
            signal
          );
          controller.close();
        },
      });

      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    };

    if (frontmatter.text_config) return runTextOrObject("text");
    if (frontmatter.object_config) return runTextOrObject("object");

    if (frontmatter.image_config) {
      const executeImage = this.executor.executeImage?.bind(this.executor);
      if (!executeImage) {
        throw new Error(
          `Executor '${this.executor.name}' does not support image prompts.`
        );
      }
      const prompt = await this.client.loadImagePrompt(promptAst);
      const dataset = await prompt.formatWithDataset({
        datasetPath: resolvedDatasetPath,
        ...(sampling ? { sampling } : {}),
        telemetry,
      });
      const stream = new ReadableStream({
        async start(controller) {
          const reader =
            dataset.getReader() as ReadableStreamDefaultReader<any>;
          await runDatasetPool(
            reader,
            async (item) => {
              if (item.type === "error") {
                controller.enqueue(experimentErrorChunk(item.error));
                return;
              }
              try {
                const res = await executeImage(item.formatted, {});
                const chunk = wireJson({
                  type: "dataset",
                  result: {
                    input: item.dataset.input,
                    expectedOutput: item.dataset.expected_output,
                    actualOutput: res.result,
                    evals: [],
                  },
                  runId: experimentRunId,
                  runName: datasetRunName,
                });
                controller.enqueue(chunk);
              } catch (err) {
                controller.enqueue(experimentErrorChunk(err));
              }
            },
            concurrency,
            signal
          );
          controller.close();
        },
      });
      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    if (frontmatter.speech_config) {
      const executeSpeech = this.executor.executeSpeech?.bind(this.executor);
      if (!executeSpeech) {
        throw new Error(
          `Executor '${this.executor.name}' does not support speech prompts.`
        );
      }
      const prompt = await this.client.loadSpeechPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({
        datasetPath: resolvedDatasetPath,
        ...(sampling ? { sampling } : {}),
        telemetry,
      });
      const stream = new ReadableStream({
        async start(controller) {
          const reader =
            dataset.getReader() as ReadableStreamDefaultReader<any>;
          await runDatasetPool(
            reader,
            async (item) => {
              if (item.type === "error") {
                controller.enqueue(experimentErrorChunk(item.error));
                return;
              }
              try {
                const res = await executeSpeech(item.formatted, {});
                const chunk = wireJson({
                  type: "dataset",
                  result: {
                    input: item.dataset.input,
                    expectedOutput: item.dataset.expected_output,
                    actualOutput: res.result,
                    evals: [],
                  },
                  runId: experimentRunId,
                  runName: datasetRunName,
                });
                controller.enqueue(chunk);
              } catch (err) {
                controller.enqueue(experimentErrorChunk(err));
              }
            },
            concurrency,
            signal
          );
          controller.close();
        },
      });
      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    throw new Error("Invalid prompt");
  }
}
