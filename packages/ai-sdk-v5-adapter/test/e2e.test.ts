/**
 * E2E Integration Tests for Seamless Pull-Models Flow
 *
 * Tests the full workflow:
 * 1. Create registry with registerProviders()
 * 2. Use provider/model format (as written by pull-models CLI)
 * 3. Attempt to run a prompt
 * 4. Verify it fails with API key error (not resolution error)
 *
 * This proves the wiring works end-to-end: model registration, provider resolution,
 * and model function dispatch all succeed. The only failure is the API call itself.
 */

import { describe, it, expect, vi } from "vitest";
import { createOpenAI } from "@ai-sdk/openai";
import { VercelAIModelRegistry, createAgentMarkClient } from "../src";
import { FileLoader } from "@agentmark-ai/loader-file";
import { fileURLToPath } from "url";
import path from "path";
import { generateText } from "ai";

describe("E2E: Seamless Pull-Models Flow", () => {
  const fixturesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

  it("should wire OpenAI provider/model through full flow and fail at API call (not resolution)", async () => {
    // Step 1: Create registry and register OpenAI provider (as scaffolding would do)
    const registry = new VercelAIModelRegistry();
    const openai = createOpenAI({ apiKey: "invalid-key" }); // Invalid key to trigger auth error
    registry.registerProviders({ openai });

    // Step 2: Create client (simulates user's client.ts)
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Step 3: Load a prompt that uses provider/model format (as pull-models writes it)
    // We'll create a simple inline AST instead of relying on fixtures
    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-openai
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

    // Step 4: Attempt to run the prompt
    // This should fail with an authentication error, NOT a model resolution error
    try {
      await generateText({
        model: params.model,
        messages: params.messages,
      });
      // If we get here, the test should fail (no API key should work)
      expect.fail("Expected API call to fail with authentication error");
    } catch (error: any) {
      // Verify the error is about authentication, not model resolution
      const errorMessage = error.message?.toLowerCase() || "";
      const errorString = String(error).toLowerCase();

      // Should NOT be a resolution error
      expect(errorMessage).not.toContain("no model function found");
      expect(errorMessage).not.toContain("provider");
      expect(errorMessage).not.toContain("not registered");
      expect(errorString).not.toContain("no model function found");

      // Should be an API/auth error (various possible messages from OpenAI)
      const isAuthError =
        errorMessage.includes("api") ||
        errorMessage.includes("key") ||
        errorMessage.includes("auth") ||
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorMessage.includes("incorrect") ||
        errorString.includes("api") ||
        errorString.includes("key") ||
        errorString.includes("auth");

      expect(isAuthError).toBe(true);
    }
  });

  it("should wire another OpenAI model through full flow", async () => {
    // Step 1: Register OpenAI provider
    const registry = new VercelAIModelRegistry();
    const openai = createOpenAI({ apiKey: "invalid-key-2" });
    registry.registerProviders({ openai });

    // Step 2: Create client
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Step 3: Load prompt with openai/model format (different model)
    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-openai-2
text_config:
  model_name: openai/gpt-4o`,
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

    // Step 4: Attempt to run
    try {
      await generateText({
        model: params.model,
        messages: params.messages,
      });
      expect.fail("Expected API call to fail with authentication error");
    } catch (error: any) {
      const errorMessage = error.message?.toLowerCase() || "";
      const errorString = String(error).toLowerCase();

      // Should NOT be a resolution error
      expect(errorMessage).not.toContain("no model function found");
      expect(errorString).not.toContain("no model function found");

      // Should be an API/auth error
      const isAuthError =
        errorMessage.includes("api") ||
        errorMessage.includes("key") ||
        errorMessage.includes("auth") ||
        errorMessage.includes("401") ||
        errorMessage.includes("403") ||
        errorString.includes("api") ||
        errorString.includes("key") ||
        errorString.includes("auth");

      expect(isAuthError).toBe(true);
    }
  });

  it("should support multiple models from same provider", async () => {
    // Step 1: Register OpenAI provider once
    const registry = new VercelAIModelRegistry();
    const openai = createOpenAI({ apiKey: "invalid-openai-key" });
    registry.registerProviders({ openai });

    // Step 2: Test multiple OpenAI models work
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Test gpt-4o-mini
    const prompt1Ast = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-multi-model-1
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

    const prompt1 = await client.loadTextPrompt(prompt1Ast as any);
    const params1 = await prompt1.format({ props: {} });
    expect(params1.model).toBeDefined();

    // Test gpt-4o (different model, same provider)
    const prompt2Ast = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-multi-model-2
text_config:
  model_name: openai/gpt-4o`,
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

    const prompt2 = await client.loadTextPrompt(prompt2Ast as any);
    const params2 = await prompt2.format({ props: {} });
    expect(params2.model).toBeDefined();
  });

  it("should fail with clear error when provider is not registered", async () => {
    // Step 1: Create registry WITHOUT registering any provider
    const registry = new VercelAIModelRegistry();

    // Step 2: Try to use a model from unregistered provider
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-unregistered
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

    // Step 3: Should throw when trying to format (model resolution happens here)
    await expect(prompt.format({ props: {} })).rejects.toThrow(/not registered/);
  });

  it("should resolve speech models via registerProviders", () => {
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      speechModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}`, type: "speech" })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    const creator = registry.getModelFunction("openai/tts-1", "speechModel");
    const model = creator("openai/tts-1");

    expect(mockOpenAI.speechModel).toHaveBeenCalledWith("tts-1");
    expect(model).toEqual({ id: "openai:tts-1", type: "speech" });
  });

  it("should work with image models using provider/model format", async () => {
    // Step 1: Register OpenAI provider for image models
    const registry = new VercelAIModelRegistry();
    const openai = createOpenAI({ apiKey: "invalid-key" });
    registry.registerProviders({ openai });

    // Step 2: Create client
    const loader = new FileLoader(fixturesPath);
    const client = createAgentMarkClient({ loader, modelRegistry: registry });

    // Step 3: Load image prompt
    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-image
image_config:
  model_name: openai/dall-e-3
  size: 1024x1024`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", value: "A cat" }],
            },
          ],
        },
      ],
    };

    const prompt = await client.loadImagePrompt(promptAst as any);
    const params = await prompt.format({ props: {} });

    // Verify the model is resolved
    expect(params.model).toBeDefined();
  });
});
