/**
 * BYO-SDK prompt management — "we don't care what they bring".
 *
 * Proves a team with a PRE-EXISTING raw LLM SDK (here a fake AWS Bedrock
 * client) can adopt AgentMark for prompt management WITHOUT writing a custom
 * Adapter: `createAgentMark` (no adapter argument — the neutral
 * `DefaultAdapter` is the default) renders a `.prompt.mdx` to a NEUTRAL
 * `{ messages, text_config }` shape — with full type-safe props — that feeds
 * straight into the user's own SDK call.
 *
 * Companion to sdk/src/test/custom-sdk-migration.test.ts (tracing + experiments).
 * Together they show the full migration needs zero Adapter/Executor code.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { createAgentMark } from "../src";
import { FileLoader } from "@agentmark-ai/loader-file";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

// The user's PRE-EXISTING SDK. Zero AgentMark imports — stands in for
// `@aws-sdk/client-bedrock-runtime`. It just takes messages and returns text.
class FakeBedrockRuntime {
  async converse(
    messages: Array<{ role: string; content: unknown }>,
  ): Promise<{ outputText: string }> {
    const user = messages.find((m) => m.role === "user");
    return { outputText: `bedrock replied to: ${JSON.stringify(user?.content)}` };
  }
}

// Generated-types stand-in — note this is the SAME typing a real
// `agentmark.types.ts` provides; type safety does NOT depend on an SDK adapter.
type SupportPromptTypes = {
  "fixtures/byo-support.prompt.mdx": {
    kind: "text";
    input: { question: string };
    output: { reply: string };
  };
};

describe("BYO-SDK prompt management (DefaultAdapter, no SDK adapter)", () => {
  const testDir = path.resolve(__dirname);
  const client = createAgentMark<SupportPromptTypes>({
    loader: new FileLoader(testDir),
  });

  beforeAll(async () => {
    await setupFixtures();
  });
  afterAll(() => {
    cleanupFixtures();
  });

  it("renders to a neutral {messages, text_config} a raw SDK consumes directly", async () => {
    const prompt = await client.loadTextPrompt("fixtures/byo-support.prompt.mdx");

    // `props` is type-safe ({ question: string }) with NO SDK adapter in play.
    const formatted = await prompt.format({
      props: { question: "How do I get a refund?" },
    });

    // Neutral, SDK-agnostic output — no Bedrock/Vercel param shape imposed.
    expect(formatted.text_config.model_name).toBe("my-bedrock-model");
    expect(Array.isArray(formatted.messages)).toBe(true);
    const roles = formatted.messages.map((m) => m.role);
    expect(roles).toContain("system");
    expect(roles).toContain("user");

    // The rendered messages feed straight into the user's raw SDK call.
    const bedrock = new FakeBedrockRuntime();
    const res = await bedrock.converse(
      formatted.messages as Array<{ role: string; content: unknown }>,
    );
    expect(res.outputText).toContain("refund");
  });
});
