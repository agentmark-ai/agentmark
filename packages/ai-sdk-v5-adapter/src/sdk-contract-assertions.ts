/**
 * COMPILE-TIME contract assertions pinning AI SDK v5's REAL types to the
 * field names the shared executor factory reads.
 *
 * The shared views in `@agentmark-ai/ai-sdk-shared` are permissive
 * supersets — by construction they CANNOT catch upstream renames (a renamed
 * field just reads as absent). These assertions are the rename tripwires:
 * they live where the real `ai` types exist, are anchored to the FUNCTIONS
 * (`typeof ai.streamText` …) so type-name churn can't dodge them, and they
 * fail `yarn build` (tsup dts type-resolution) on the exact PR that bumps
 * `ai` to a major that moves a field.
 *
 * Validation that the tripwires themselves fire: the `@ts-expect-error`
 * block at the bottom asserts the v4 field names do NOT type-check against
 * v5 — if the mechanism ever rots into accepting anything, those lines
 * become "unused @ts-expect-error" build errors.
 *
 * Type-only module: erased at build time, zero runtime weight.
 */
import * as ai from "ai";
import type {
  VercelGenerateTextResult,
  VercelStreamTextResult,
  VercelGenerateObjectResult,
  VercelStreamObjectResult,
  VercelImageResult,
  VercelSpeechResult,
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
type ToolResultChunk = Extract<FullStreamChunk, { type: "tool-result" }>;
type ObjectChunk = Extract<ObjectFullChunk, { type: "object" }>;

// ── Field pins: every field the shared factory / v5Chunks reads ────────────
export type _TextDeltaCarriesText = Expect<
  TextDeltaChunk extends { text: string } ? true : false
>;
export type _FinishCarriesTotalUsage = Expect<
  FinishChunk extends { totalUsage: unknown } ? true : false
>;
export type _FinishCarriesReason = Expect<
  FinishChunk extends { finishReason: unknown } ? true : false
>;
export type _ToolCallShape = Expect<
  ToolCallChunk extends { toolCallId: string; toolName: string; input: unknown }
    ? true
    : false
>;
export type _ToolResultShape = Expect<
  ToolResultChunk extends { toolCallId: string; toolName: string; output: unknown }
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
export type _StreamTextSideChannels = Expect<
  StreamTextResult extends {
    usage: PromiseLike<unknown>;
    experimental_partialOutputStream: AsyncIterable<unknown>;
  }
    ? true
    : false
>;
export type _GenerateObjectShape = Expect<
  GenerateObjectResult extends { object: unknown; usage: unknown }
    ? true
    : false
>;
export type _StreamObjectUsagePromise = Expect<
  StreamObjectResult extends { usage: PromiseLike<unknown> } ? true : false
>;

// ── E2E view satisfaction: the real ai@5 results must be assignable to the
//    shared factory's typed views, with NO casts on the result side. This is
//    the compile-time proof that `createVercelExecutor`'s typed surface
//    accepts this major. (Params are contravariant — the executor binding
//    casts those; results are what the views check.)
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
export type _ViewImage = Expect<
  ReturnType<typeof ai.experimental_generateImage> extends PromiseLike<VercelImageResult>
    ? true
    : false
>;
export type _ViewSpeech = Expect<
  ReturnType<typeof ai.experimental_generateSpeech> extends PromiseLike<VercelSpeechResult>
    ? true
    : false
>;
// Output.object is the tools-path structured-output hook the factory calls.
export type _OutputObjectExists = Expect<
  typeof ai.Output.object extends (opts: { schema: never }) => unknown
    ? true
    : false
>;

// ── Negative tripwire validation: prove the pins CHECK types rather than
//    accept anything. Wrong field types must fail; if the mechanism ever
//    degrades, these become "unused '@ts-expect-error'" BUILD ERRORS.
//    (Single-line on purpose — the directive covers exactly one line.)
// prettier-ignore
// @ts-expect-error text-delta's `text` is a string, not a number — the pin must reject this
export type _NegTextDeltaType = Expect<TextDeltaChunk extends { text: number } ? true : false>;
// prettier-ignore
// @ts-expect-error tool-call ids are strings — the pin must reject a number here
export type _NegToolCallIdType = Expect<ToolCallChunk extends { toolCallId: number } ? true : false>;

/** Marker so the module is a real export site (type-only otherwise). */
export type SdkContractAsserted = true;
