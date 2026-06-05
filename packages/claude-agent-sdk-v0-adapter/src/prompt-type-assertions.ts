/**
 * COMPILE-TIME pins for the claude adapter's prompt-object type flow.
 *
 * The v4/v5/mastra adapters enforce these via vitest typecheck mode; this
 * package's vitest config is skip-worktree-managed, so the pins live in
 * src/ instead and ride the build's type resolution (the index type-export
 * pulls this module into the entry graph). Weaker than real-tsc-over-tests
 * — documented trade-off of the managed config.
 */
import type { AgentMark, RichChatMessage } from "@agentmark-ai/prompt-core";
import type { ClaudeAgentAdapter } from "./adapter";
import type {
  ClaudeAgentTextParams,
  ClaudeAgentObjectParams,
} from "./types";

type Expect<T extends true> = T;

type TestPrompts = {
  "greet.prompt.mdx": { input: { userName: string }; output: string; kind: "text" };
  "math.prompt.mdx": {
    input: { question: string };
    output: { answer: string };
    kind: "object";
  };
};

type Client = AgentMark<TestPrompts, ClaudeAgentAdapter<TestPrompts>>;

type TextPromptOf = Awaited<ReturnType<Client["loadTextPrompt"]>>;
type ObjectPromptOf = Awaited<ReturnType<Client["loadObjectPrompt"]>>;
type TextFormatted = Awaited<ReturnType<TextPromptOf["format"]>>;
type ObjectFormatted = Awaited<ReturnType<ObjectPromptOf["format"]>>;

/** format() lands on the adapter's SDK-native param bags. */
export type _TextFormatted = Expect<
  TextFormatted extends ClaudeAgentTextParams ? true : false
>;
export type _ObjectFormatted = Expect<
  ObjectFormatted extends ClaudeAgentObjectParams ? true : false
>;

/** The pieces the executor + evals consume are typed on the bag. */
export type _QueryPromptIsString = Expect<
  TextFormatted["query"]["prompt"] extends string ? true : false
>;
export type _MessagesAreRich = Expect<
  TextFormatted["messages"] extends RichChatMessage[] ? true : false
>;
export type _ObjectCarriesOutputFormat = Expect<
  ObjectFormatted["query"]["options"] extends {
    outputFormat: { type: "json_schema"; schema: Record<string, unknown> };
  }
    ? true
    : false
>;

/** Kind-gating: text keys are not object keys and vice versa. */
export type _LoadKindGating = Expect<
  Parameters<Client["loadTextPrompt"]>[0] extends infer P
    ? "math.prompt.mdx" extends P
      ? false // object key must NOT be a valid text-load argument
      : true
    : never
>;

export type PromptTypesAsserted = true;
