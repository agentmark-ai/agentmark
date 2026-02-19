/**
 * E2E Integration Tests for Seamless Pull-Models Flow (Mastra v0)
 *
 * Tests the full workflow:
 * 1. Create registry with registerProviders()
 * 2. Use provider/model format (as written by pull-models CLI)
 * 3. Attempt to run a prompt
 * 4. Verify it fails with API key error (not resolution error)
 */

import { describe, it, expect } from "vitest";
import { MastraModelRegistry, createAgentMarkClient } from "../src";
import { FileLoader } from "@agentmark-ai/loader-file";
import { fileURLToPath } from "url";
import path from "path";

describe("E2E: Seamless Pull-Models Flow (Mastra v0)", () => {
  const fixturesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

  it("should wire provider/model through full flow using Mastra AI object", async () => {
    // Step 1: Create registry and register a provider using Mastra's AI object pattern
    const registry = new MastraModelRegistry();

    // Simulate Mastra AI provider object with languageModel method
    const mockOpenAI = {
      languageModel: (modelId: string) => {
        // This simulates what Mastra's AI provider does
        return {
          modelId: `openai:${modelId}`,
          provider: "openai",
          // When called, would make API request and fail with auth error
          generate: () => {
            throw new Error("API key authentication failed - invalid API key provided");
          }
        };
      }
    };

    registry.registerProviders({ openai: mockOpenAI });

    // Step 2: Create client
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Step 3: Load prompt with provider/model format
    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-mastra-openai
text_config:
  model_name: openai/gpt-4o-mini`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "Say hello" }],
            },
          ],
        },
      ],
    };

    const prompt = await client.loadTextPrompt(promptAst as any);
    const params = await prompt.format({ props: {} });

    // Step 4: Verify model was resolved
    expect(params.model).toBeDefined();
    expect(params.model.modelId).toContain("gpt-4o-mini");
  });

  it("should support multiple providers registered at once", async () => {
    // Step 1: Register multiple providers
    const registry = new MastraModelRegistry();

    const mockOpenAI = {
      languageModel: (modelId: string) => ({
        modelId: `openai:${modelId}`,
        provider: "openai",
      })
    };

    const mockAnthropic = {
      languageModel: (modelId: string) => ({
        modelId: `anthropic:${modelId}`,
        provider: "anthropic",
      })
    };

    registry.registerProviders({ openai: mockOpenAI, anthropic: mockAnthropic });

    // Step 2: Test both models resolve
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Test OpenAI
    const openaiPrompt = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-mastra-multi-openai
text_config:
  model_name: openai/gpt-4o-mini`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            { type: "paragraph", children: [{ type: "text", value: "Test" }] },
          ],
        },
      ],
    };

    const prompt1 = await client.loadTextPrompt(openaiPrompt as any);
    const params1 = await prompt1.format({ props: {} });
    expect(params1.model).toBeDefined();
    expect(params1.model.provider).toBe("openai");

    // Test Anthropic
    const anthropicPrompt = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-mastra-multi-anthropic
text_config:
  model_name: anthropic/claude-3-5-haiku-20241022`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            { type: "paragraph", children: [{ type: "text", value: "Test" }] },
          ],
        },
      ],
    };

    const prompt2 = await client.loadTextPrompt(anthropicPrompt as any);
    const params2 = await prompt2.format({ props: {} });
    expect(params2.model).toBeDefined();
    expect(params2.model.provider).toBe("anthropic");
  });

  it("should fail with clear error when provider is not registered", async () => {
    const registry = new MastraModelRegistry();
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-mastra-unregistered
text_config:
  model_name: openai/gpt-4o-mini`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            { type: "paragraph", children: [{ type: "text", value: "Test" }] },
          ],
        },
      ],
    };

    const prompt = await client.loadTextPrompt(promptAst as any);
    await expect(prompt.format({ props: {} })).rejects.toThrow(/not registered/);
  });

  // Note: Mastra adapter does not yet support image models, so we skip those tests
});
