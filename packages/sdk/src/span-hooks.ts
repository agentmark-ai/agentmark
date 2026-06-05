/**
 * Span-hook adapters wiring `@agentmark-ai/sdk`'s `span()` into the
 * `PromptSpanHook` + `ExperimentItemSpanHook` contract exposed by
 * `@agentmark-ai/prompt-core`.
 *
 * prompt-core used to import `span` directly, which inverted the package
 * dependency graph (prompt-core is the base of the SDK stack; the SDK
 * builds on top of it). The runner now accepts hooks; this file is the
 * canonical wiring adapters reach for when they want the default OTEL
 * integration.
 */

import { span } from "./trace";
import type { SpanContext } from "./trace/tracing";
import type {
  ExperimentItemParams,
  ExperimentItemSpanHook,
  PromptSpanHook,
  PromptSpanParams,
  SpanLike,
} from "@agentmark-ai/prompt-core";

/** Wraps an SDK SpanContext so it satisfies the prompt-core SpanLike shape. */
function toSpanLike(ctx: SpanContext): SpanLike {
  return {
    traceId: ctx.traceId,
    setAttribute: (key, value) => {
      try {
        ctx.setAttribute(key, value);
      } catch {
        /* tracing must never break the run */
      }
    },
  };
}

export const agentmarkPromptSpanHook: PromptSpanHook = async <T>(
  params: PromptSpanParams,
  fn: (ctx: SpanLike) => Promise<T>
): Promise<{ result: T; traceId: string }> => {
  const r = await span({ name: params.name }, async (ctx) => fn(toSpanLike(ctx)));
  return { result: await r.result, traceId: r.traceId };
};

export const agentmarkExperimentItemSpanHook: ExperimentItemSpanHook = async <T>(
  params: ExperimentItemParams,
  fn: (ctx: SpanLike) => Promise<T>
): Promise<{ result: T; traceId: string }> => {
  const expected =
    params.datasetExpectedOutput === undefined
      ? undefined
      : typeof params.datasetExpectedOutput === "string"
        ? params.datasetExpectedOutput
        : JSON.stringify(params.datasetExpectedOutput);
  const r = await span(
    {
      name: `experiment-${params.datasetRunName}-${params.index}`,
      datasetRunId: params.experimentRunId,
      datasetRunName: params.datasetRunName,
      datasetItemName: params.datasetItemName,
      datasetExpectedOutput: expected,
      datasetPath: params.datasetPath,
      experimentKey: params.experimentKey,
      sourceTreeHash: params.sourceTreeHash,
      metadata: params.commitSha ? { commit_sha: params.commitSha } : undefined,
    },
    async (ctx) => fn(toSpanLike(ctx))
  );
  return { result: await r.result, traceId: r.traceId };
};

/**
 * Convenience bundle — the standard set of hooks every official adapter
 * wires into `new WebhookRunner(client, executor, createAgentmarkSpanHooks())`.
 */
export const createAgentmarkSpanHooks = () => ({
  promptSpanHook: agentmarkPromptSpanHook,
  experimentItemSpanHook: agentmarkExperimentItemSpanHook,
});
