/**
 * E2E Integration Tests for Seamless Pull-Models Flow (AI SDK v4)
 *
 * Tests the full workflow:
 * 1. Create registry with registerProviders()
 * 2. Use provider/model format (as written by pull-models CLI)
 * 3. Format the prompt successfully
 * 4. Verify model resolution works (model object is created)
 *
 * Note: We use mock providers to avoid needing real API keys, focusing on
 * testing the registration and resolution flow.
 */

import { describe, it, expect, vi } from "vitest";
import { VercelAIModelRegistry, VercelAIAdapter, createAgentMarkClient } from "../src";
import { createAgentMark } from "@agentmark-ai/prompt-core";
import { FileLoader } from "@agentmark-ai/loader-file";
import { fileURLToPath } from "url";
import path from "path";

describe("E2E: Seamless Pull-Models Flow (AI SDK v4)", () => {
  const fixturesPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

  it("should wire OpenAI provider/model through full flow", () => {
    // Step 1: Create registry and register OpenAI provider with mock
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      languageModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}`, provider: "openai" })),
      imageModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}`, type: "image" })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    // Step 2: Verify model resolution via getModelFunction
    const creator = registry.getModelFunction("openai/gpt-4o-mini", "languageModel");
    const model = creator("openai/gpt-4o-mini");

    // Step 3: Verify provider method was called correctly
    expect(mockOpenAI.languageModel).toHaveBeenCalledWith("gpt-4o-mini");
    expect(model).toEqual({ id: "openai:gpt-4o-mini", provider: "openai" });
  });

  it("should support multiple models from same provider", () => {
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      languageModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}` })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    // Test gpt-4o-mini
    const creator1 = registry.getModelFunction("openai/gpt-4o-mini", "languageModel");
    creator1("openai/gpt-4o-mini");
    expect(mockOpenAI.languageModel).toHaveBeenCalledWith("gpt-4o-mini");

    // Test gpt-4o (different model, same provider)
    const creator2 = registry.getModelFunction("openai/gpt-4o", "languageModel");
    creator2("openai/gpt-4o");
    expect(mockOpenAI.languageModel).toHaveBeenCalledWith("gpt-4o");
  });

  it("should fail with clear error when provider is not registered", () => {
    const registry = new VercelAIModelRegistry();

    expect(() =>
      registry.getModelFunction("openai/gpt-4o-mini", "languageModel")
    ).toThrow(/not registered/);
  });

  it("should work with image models using provider/model format", () => {
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      imageModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}`, type: "image" })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    const creator = registry.getModelFunction("openai/dall-e-3", "imageModel");
    const model = creator("openai/dall-e-3");

    expect(mockOpenAI.imageModel).toHaveBeenCalledWith("dall-e-3");
    expect(model).toEqual({ id: "openai:dall-e-3", type: "image" });
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

  it("should integrate with AgentMark client for prompt formatting", async () => {
    // Step 1: Create registry with mock provider
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      languageModel: vi.fn((modelId: string) => ({
        id: `openai:${modelId}`,
        provider: "openai",
        modelId,
      })),
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
          value: `name: test-openai-v4
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
    expect(params.model.modelId).toBe("gpt-4o-mini");
    expect(mockOpenAI.languageModel).toHaveBeenCalledWith("gpt-4o-mini");
  });

  it("should pass builtInModels validation AND resolve model in the same flow", async () => {
    // This tests the full chain: builtInModels allow-list check → adapter resolution
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      languageModel: vi.fn((modelId: string) => ({
        id: `openai:${modelId}`,
        provider: "openai",
        modelId,
      })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    const adapter = new VercelAIAdapter(registry);
    const loader = new FileLoader(fixturesPath);

    // builtInModels enforces only these models are allowed
    const agentMark = createAgentMark({
      adapter,
      loader: loader as any,
      builtInModels: ["openai/gpt-4o-mini"],
    });

    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-combined
text_config:
  model_name: openai/gpt-4o-mini`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            { type: "paragraph", children: [{ type: "text", value: "Hello" }] },
          ],
        },
      ],
    };

    // Passes validation (model is in builtInModels) AND resolves via registerProviders
    const prompt = await agentMark.loadTextPrompt(promptAst as any);
    const params = await prompt.format({ props: {} });

    expect(params.model.modelId).toBe("gpt-4o-mini");
    expect(mockOpenAI.languageModel).toHaveBeenCalledWith("gpt-4o-mini");
  });

  it("should fail builtInModels validation before reaching adapter resolution", async () => {
    const registry = new VercelAIModelRegistry();
    const mockOpenAI = {
      languageModel: vi.fn((modelId: string) => ({ id: `openai:${modelId}`, modelId })),
    };
    registry.registerProviders({ openai: mockOpenAI });

    const adapter = new VercelAIAdapter(registry);
    const loader = new FileLoader(fixturesPath);

    const agentMark = createAgentMark({
      adapter,
      loader: loader as any,
      builtInModels: ["openai/gpt-4o"], // only gpt-4o allowed, not gpt-4o-mini
    });

    const promptAst = {
      type: "root",
      children: [
        {
          type: "yaml",
          value: `name: test-blocked
text_config:
  model_name: openai/gpt-4o-mini`,
        },
        {
          type: "mdxJsxFlowElement",
          name: "User",
          attributes: [],
          children: [
            { type: "paragraph", children: [{ type: "text", value: "Hello" }] },
          ],
        },
      ],
    };

    await expect(agentMark.loadTextPrompt(promptAst as any)).rejects.toThrow(
      /not in builtInModels/
    );
    // Adapter was never reached
    expect(mockOpenAI.languageModel).not.toHaveBeenCalled();
  });
});
