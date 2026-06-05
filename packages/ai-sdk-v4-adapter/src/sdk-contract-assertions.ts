/**
 * COMPILE-TIME contract assertions pinning AI SDK v4's REAL types to the
 * field names the shared executor factory reads. See the v5 adapter's twin
 * for the full rationale (superset views can't catch renames; these
 * function-anchored pins are the tripwires, enforced by `yarn build`).
 *
 * Type-only module: erased at build time, zero runtime weight.
 */
import * as ai from "ai";
import type {
  VercelGenerateTextResult,
  VercelStreamTextResult,
  VercelGenerateObjectResult,
  VercelStreamObjectResult,
} from "@agentmark-ai/ai-sdk-shared";

type Expect<T extends true> = T;

// ── Derived from the real function types (not type names) ──────────────────
type StreamTextResult = ReturnType<typeof ai.streamText>;
type FullStreamChunk =
  StreamTextResult["fullStream"] extends AsyncIterable<infer C> ? C : never;
type GenerateTextResult = Awaited<ReturnType<typeof ai.generateText>>;
type GenerateObjectResult = Awaited<ReturnType<typeof ai.generateObject>>;
type StreamObjectResult = ReturnType<typeof ai.streamObject>;
type ObjectFullChunk =
  StreamObjectResult["fullStream"] extends AsyncIterable<infer C> ? C : never;

type TextDeltaChunk = Extract<FullStreamChunk, { type: "text-delta" }>;
type FinishChunk = Extract<FullStreamChunk, { type: "finish" }>;
type ToolCallChunk = Extract<FullStreamChunk, { type: "tool-call" }>;
type ObjectChunk = Extract<ObjectFullChunk, { type: "object" }>;

// ── Field pins: every field the shared factory / v4Chunks reads ────────────
export type _TextDeltaCarriesTextDelta = Expect<
  TextDeltaChunk extends { textDelta: string } ? true : false
>;
export type _FinishCarriesUsage = Expect<
  FinishChunk extends { usage: unknown } ? true : false
>;
export type _FinishCarriesReason = Expect<
  FinishChunk extends { finishReason: unknown } ? true : false
>;
export type _ToolCallShape = Expect<
  ToolCallChunk extends { toolCallId: string; toolName: string; args: unknown }
    ? true
    : false
>;
export type _ObjectChunkCarriesObject = Expect<
  ObjectChunk extends { object: unknown } ? true : false
>;
export type _GenerateTextShape = Expect<
  GenerateTextResult extends {
    text: string;
    finishReason: unknown;
    usage: unknown;
    steps: unknown[];
  }
    ? true
    : false
>;
export type _StreamTextUsagePromise = Expect<
  StreamTextResult extends { usage: PromiseLike<unknown> } ? true : false
>;
export type _GenerateObjectShape = Expect<
  GenerateObjectResult extends { object: unknown; usage: unknown }
    ? true
    : false
>;
export type _StreamObjectUsagePromise = Expect<
  StreamObjectResult extends { usage: PromiseLike<unknown> } ? true : false
>;

// ── E2E view satisfaction: real ai@4 results must satisfy the shared
//    factory's typed views with no casts on the result side.
export type _ViewGenerateText = Expect<
  ReturnType<typeof ai.generateText> extends PromiseLike<VercelGenerateTextResult>
    ? true
    : false
>;
export type _ViewStreamText = Expect<
  StreamTextResult extends VercelStreamTextResult ? true : false
>;
export type _ViewGenerateObject = Expect<
  ReturnType<typeof ai.generateObject> extends PromiseLike<VercelGenerateObjectResult>
    ? true
    : false
>;
export type _ViewStreamObject = Expect<
  StreamObjectResult extends VercelStreamObjectResult ? true : false
>;

// ── Negative tripwire validation (single-line; see v5 twin) ────────────────
// prettier-ignore
// @ts-expect-error text-delta's `textDelta` is a string, not a number — the pin must reject this
export type _NegTextDeltaType = Expect<TextDeltaChunk extends { textDelta: number } ? true : false>;
// prettier-ignore
// @ts-expect-error tool-call ids are strings — the pin must reject a number here
export type _NegToolCallIdType = Expect<ToolCallChunk extends { toolCallId: number } ? true : false>;

/** Marker so the module is a real export site (type-only otherwise). */
export type SdkContractAsserted = true;
