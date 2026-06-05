/**
 * Span-hook primitives for the shared WebhookRunner.
 *
 * prompt-core is the base layer of the SDK stack; `@agentmark-ai/sdk` (which
 * provides the `span()` helper + OTEL integration) is downstream of it.
 * Importing `span` directly here inverted that dependency direction, so this
 * module defines a minimal callback-style contract adapters implement in
 * whatever OTEL library they bring. The shared runner calls the hook; the
 * hook owns SDK concerns.
 *
 * Mirrors `ExperimentItemSpanHook` in prompt-core-python — same philosophy,
 * same attribute conventions. The `PromptSpanHook` covers the runPrompt path
 * (which has no direct Python equivalent: Python adapters wrap spans inside
 * their executors, TS wraps at the runner). When no hook is provided the
 * runner uses the null implementations below, which execute the work
 * without any OTEL context and emit `traceId: ""` on the wire.
 */

/**
 * Minimal span contract the runner annotates. Concrete OTEL spans satisfy
 * this naturally; tests and null hooks provide stubs.
 */
export interface SpanLike {
  /**
   * Wire trace id for the request. Exactly what ends up in the response's
   * `traceId` field, so adapters MUST format it the way downstream
   * consumers expect (AgentMark cloud expects 32-char lowercase hex).
   */
  readonly traceId: string;
  setAttribute(key: string, value: string): void;
}

export interface PromptSpanParams {
  /** OTEL span name — typically the prompt name or `"prompt-run"`. */
  name: string;
  /** Prompt name from frontmatter, for the trace surface's label column. */
  promptName?: string;
}

export interface ExperimentItemParams {
  /** 0-based index of this item within the dataset run. */
  index: number;
  /** Prompt name from frontmatter. */
  promptName?: string;
  /** User-visible run name (e.g. `"run-sampling"`). */
  datasetRunName: string;
  /** UUID assigned once per experiment invocation, shared across items. */
  experimentRunId: string;
  /** Item identifier (adapter decides: raw index, md5(input), etc.). */
  datasetItemName: string;
  /** Raw dataset input for the item — hook serializes if needed. */
  datasetInput?: unknown;
  /** Raw expected output — hook serializes if needed. */
  datasetExpectedOutput?: unknown;
  /** Path of the dataset file/URL. */
  datasetPath?: string;
  /** Git commit sha the run is tagged with. */
  commitSha?: string;
  /**
   * Stable experiment identity for the regression gate. Set alongside
   * `experimentRunId` so the baseline resolver can group runs of the same
   * experiment across commits. See prompt-core's baseline.ts.
   */
  experimentKey?: string;
  /** Source-tree hash the run was produced from, for baseline attribution. */
  sourceTreeHash?: string;
}

/**
 * Callback-style span hook: the hook opens a span, invokes `fn` with it,
 * and returns the function's result + the wire trace id. This matches the
 * `span()` helper shape in `@agentmark-ai/sdk` so adapters can forward
 * directly; it's also simple enough for tests + custom OTEL setups to
 * implement in ~10 LOC.
 */
export type PromptSpanHook = <T>(
  params: PromptSpanParams,
  fn: (span: SpanLike) => Promise<T>
) => Promise<{ result: T; traceId: string }>;

export type ExperimentItemSpanHook = <T>(
  params: ExperimentItemParams,
  fn: (span: SpanLike) => Promise<T>
) => Promise<{ result: T; traceId: string }>;

const NULL_SPAN: SpanLike = {
  traceId: "",
  setAttribute: () => {},
};

export const nullPromptSpanHook: PromptSpanHook = async <T>(
  _params: PromptSpanParams,
  fn: (span: SpanLike) => Promise<T>
): Promise<{ result: T; traceId: string }> => {
  const result = await fn(NULL_SPAN);
  return { result, traceId: "" };
};

export const nullExperimentItemSpanHook: ExperimentItemSpanHook = async <T>(
  _params: ExperimentItemParams,
  fn: (span: SpanLike) => Promise<T>
): Promise<{ result: T; traceId: string }> => {
  const result = await fn(NULL_SPAN);
  return { result, traceId: "" };
};
