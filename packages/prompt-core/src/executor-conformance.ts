import type { AgentEvent, AgentUsage, ExecCtx, Executor } from "./executor";

/**
 * Public conformance suite for Executor implementations.
 *
 * The AgentEvent protocol is a stable contract — every Executor (ours or
 * third-party) must emit events in a shape the shared WebhookRunner and
 * downstream cloud consumers can interpret consistently. This module
 * provides SDK-agnostic assertions that operate on AsyncIterable<AgentEvent>
 * streams. Implementers feed their executor's output into these assertions
 * inside their own test runner (Vitest/Jest/etc.) — we don't bundle a
 * runner here so consumers can use whichever they prefer.
 *
 * Usage:
 *   import { assertTextStream } from '@agentmark-ai/prompt-core';
 *   await assertTextStream(myExecutor.executeText(formatted, {}));
 */

export interface ConformanceViolation {
  scenario: string;
  reason: string;
  observedEvents: AgentEvent[];
}

export class ConformanceError extends Error {
  constructor(public readonly violation: ConformanceViolation) {
    super(
      `Executor conformance violation [${violation.scenario}]: ${violation.reason}\n` +
        `Observed events: ${JSON.stringify(violation.observedEvents, null, 2)}`
    );
    this.name = "ConformanceError";
  }
}

async function collect(
  events: AsyncIterable<AgentEvent>,
  signal?: AbortSignal
): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const ev of events) {
    if (signal?.aborted) break;
    out.push(ev);
  }
  return out;
}

/**
 * Verify a text-kind event stream. Contract:
 *   - Emits at least one `text-delta` OR one `tool-call` (non-empty response).
 *   - Ends with exactly one `finish` carrying usage (the single usage channel).
 *   - `tool-result` events MUST be preceded by a `tool-call` with the same `id`.
 *   - No `object-delta` / `object-final` events (wrong kind).
 *   - If an `error` event appears, it MUST be the terminal event.
 */
export async function assertTextStream(
  events: AsyncIterable<AgentEvent>,
  opts?: { allowEmpty?: boolean }
): Promise<AgentEvent[]> {
  const observed = await collect(events);
  const fail = (reason: string) => {
    throw new ConformanceError({
      scenario: "text-stream",
      reason,
      observedEvents: observed,
    });
  };

  let usageCount = 0;
  let nonEmpty = false;
  const toolCallIds = new Set<string>();
  let errorIndex = -1;

  for (let i = 0; i < observed.length; i++) {
    const ev = observed[i];
    if (ev.type === "text-delta" || ev.type === "tool-call") nonEmpty = true;
    if (ev.type === "tool-call") toolCallIds.add(ev.id);
    if (ev.type === "tool-result" && !toolCallIds.has(ev.id))
      fail(`tool-result id=${ev.id} has no preceding tool-call`);
    if (ev.type === "object-delta" || ev.type === "object-final")
      fail(`${ev.type} is not allowed in a text stream`);
    if (ev.type === "finish" && ev.usage) usageCount++;
    if (ev.type === "error") errorIndex = i;
  }

  if (errorIndex >= 0) {
    if (errorIndex !== observed.length - 1)
      fail("error event must be the terminal event");
    return observed;
  }
  if (!nonEmpty && !opts?.allowEmpty)
    fail("no text-delta or tool-call produced");
  if (usageCount !== 1)
    fail(`expected exactly one finish carrying usage, got ${usageCount}`);

  return observed;
}

/**
 * Verify an object-kind event stream. Contract:
 *   - Emits at least one `object-delta` OR one `object-final` (non-empty result).
 *   - Ends with exactly one `finish` carrying usage (the single usage channel).
 *   - No `text-delta` / `reasoning-delta` / `tool-*` events (wrong kind).
 *   - If an `error` event appears, it MUST be the terminal event.
 *
 * Streaming executors emit N `object-delta` then a terminal `finish` (the
 * builder synthesizes an `object-final` from the last delta when the SDK
 * doesn't emit one). Non-streaming executors emit one `object-final` + `finish`.
 */
export async function assertObjectStream(
  events: AsyncIterable<AgentEvent>
): Promise<AgentEvent[]> {
  const observed = await collect(events);
  const fail = (reason: string) => {
    throw new ConformanceError({
      scenario: "object-stream",
      reason,
      observedEvents: observed,
    });
  };

  let usageCount = 0;
  let nonEmpty = false;
  let errorIndex = -1;

  for (let i = 0; i < observed.length; i++) {
    const ev = observed[i];
    if (ev.type === "object-delta" || ev.type === "object-final")
      nonEmpty = true;
    if (ev.type === "finish" && ev.usage) usageCount++;
    if (ev.type === "error") errorIndex = i;
    if (
      ev.type === "text-delta" ||
      ev.type === "reasoning-delta" ||
      ev.type === "tool-call" ||
      ev.type === "tool-result"
    )
      fail(`${ev.type} is not allowed in an object stream`);
  }

  if (errorIndex >= 0) {
    if (errorIndex !== observed.length - 1)
      fail("error event must be the terminal event");
    return observed;
  }
  if (!nonEmpty) fail("no object-delta or object-final produced");
  if (usageCount !== 1)
    fail(`expected exactly one finish carrying usage, got ${usageCount}`);

  return observed;
}

/**
 * Verify an error path — any executor invoked with known-bad input must
 * emit a single terminal `error` event rather than throwing synchronously.
 */
export async function assertErrorStream(
  events: AsyncIterable<AgentEvent>
): Promise<AgentEvent[]> {
  let observed: AgentEvent[] = [];
  try {
    observed = await collect(events);
  } catch (err) {
    // Async iteration threw — the executor should emit an error event instead.
    throw new ConformanceError({
      scenario: "error-path",
      reason: `executor threw during iteration instead of emitting an error event: ${
        err instanceof Error ? err.message : String(err)
      }`,
      observedEvents: observed,
    });
  }

  const last = observed[observed.length - 1];
  if (!last || last.type !== "error") {
    throw new ConformanceError({
      scenario: "error-path",
      reason: "expected terminal error event",
      observedEvents: observed,
    });
  }
  return observed;
}

/**
 * Drive an abort scenario: collect events, fire the controller after
 * `abortAfterEvents`, and verify iteration terminates cleanly (no throw,
 * no hang). Returns the observed events — boundary assertions (no
 * post-abort emissions, signal forwarded to the SDK) are the CALLER's to
 * pin, since what "after abort" may legitimately contain (e.g. a terminal
 * `error` from a cancelled SDK call) is executor-specific.
 */
export async function assertAbortStream(
  events: AsyncIterable<AgentEvent>,
  controller: AbortController,
  opts?: { abortAfterEvents?: number }
): Promise<AgentEvent[]> {
  const abortAfter = opts?.abortAfterEvents ?? 1;
  const observed: AgentEvent[] = [];
  let iterated = 0;

  for await (const ev of events) {
    observed.push(ev);
    iterated++;
    if (iterated === abortAfter) controller.abort();
    if (controller.signal.aborted) break;
  }

  return observed;
}

/**
 * Verify a usage payload (from `finish.usage`) has the expected shape.
 * Callers can opt into strict numeric checks or just check presence.
 */
export function assertUsageShape(u: AgentUsage) {
  if (typeof u.inputTokens !== "number" || u.inputTokens < 0)
    throw new ConformanceError({
      scenario: "usage-shape",
      reason: `inputTokens must be a non-negative number, got ${u.inputTokens}`,
      observedEvents: [{ type: "finish", reason: "", usage: u }],
    });
  if (typeof u.outputTokens !== "number" || u.outputTokens < 0)
    throw new ConformanceError({
      scenario: "usage-shape",
      reason: `outputTokens must be a non-negative number, got ${u.outputTokens}`,
      observedEvents: [{ type: "finish", reason: "", usage: u }],
    });
  if (
    u.totalTokens !== undefined &&
    (typeof u.totalTokens !== "number" || u.totalTokens < 0)
  )
    throw new ConformanceError({
      scenario: "usage-shape",
      reason: `totalTokens must be a non-negative number or undefined, got ${u.totalTokens}`,
      observedEvents: [{ type: "finish", reason: "", usage: u }],
    });
}

/**
 * Convenience: drive all relevant assertions against a scenario. Callers
 * provide a `driver` that invokes their executor with a fixture and returns
 * the event stream. Used in per-adapter test suites to get one-liner coverage.
 */
export interface ScenarioDriver {
  text: () => AsyncIterable<AgentEvent>;
  textWithTools?: () => AsyncIterable<AgentEvent>;
  object: () => AsyncIterable<AgentEvent>;
  objectWithTools?: () => AsyncIterable<AgentEvent>;
  errorPath: () => AsyncIterable<AgentEvent>;
}

export async function runConformance(driver: ScenarioDriver): Promise<void> {
  await assertTextStream(driver.text());
  if (driver.textWithTools) await assertTextStream(driver.textWithTools());
  await assertObjectStream(driver.object());
  if (driver.objectWithTools) await assertObjectStream(driver.objectWithTools());
  await assertErrorStream(driver.errorPath());
}

/**
 * The `formatted` fixtures to drive an executor's conformance run. These are
 * SDK-specific (whatever your paired Adapter produces for each kind), so the
 * caller supplies them — `errorInput` should be a payload your handler rejects
 * (so the error path is exercised).
 */
export interface ExecutorConformanceInputs {
  text: unknown;
  object: unknown;
  errorInput: unknown;
  textWithTools?: unknown;
  objectWithTools?: unknown;
  /** Override the ExecCtx passed to each call (defaults to telemetry-off). */
  ctx?: ExecCtx;
}

/**
 * One-call conformance for an {@link Executor}: builds the {@link ScenarioDriver}
 * for you from `formatted` fixtures and runs the full suite. Saves hand-wiring
 * `() => executor.executeText(fixture, ctx)` closures in every BYO test.
 *
 *   await runExecutorConformance(myExecutor, {
 *     text: textFixture, object: objectFixture, errorInput: { bad: true },
 *   });
 *
 * Unless the caller pins `inputs.ctx`, the suite runs TWICE — once with
 * `shouldStream: true` and once with `shouldStream: false`. An executor that
 * implements BOTH a streaming and a one-shot handler (e.g. via `createExecutor`
 * with `text` + `streamText`) exercises BOTH branches; a single-mode executor
 * runs its one path under both contexts (cheap, and still valid). This closes
 * the footgun where a broken one-shot path passes because the default context
 * silently selected the streaming branch.
 */
export async function runExecutorConformance(
  executor: Executor,
  inputs: ExecutorConformanceInputs
): Promise<void> {
  const run = (ctx: ExecCtx) =>
    runConformance({
      text: () => executor.executeText(inputs.text, ctx),
      textWithTools:
        inputs.textWithTools !== undefined
          ? () => executor.executeText(inputs.textWithTools, ctx)
          : undefined,
      object: () => executor.executeObject(inputs.object, ctx),
      objectWithTools:
        inputs.objectWithTools !== undefined
          ? () => executor.executeObject(inputs.objectWithTools, ctx)
          : undefined,
      errorPath: () => executor.executeText(inputs.errorInput, ctx),
    });

  if (inputs.ctx) {
    await run(inputs.ctx);
    return;
  }
  await run({ telemetry: { isEnabled: false }, shouldStream: true });
  await run({ telemetry: { isEnabled: false }, shouldStream: false });
}
