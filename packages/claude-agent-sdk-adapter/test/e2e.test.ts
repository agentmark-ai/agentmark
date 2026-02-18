/**
 * E2E Integration Tests for Seamless Pull-Models Flow (Claude Agent SDK)
 *
 * Tests the full workflow:
 * 1. Create registry with registerProviders()
 * 2. Use provider/model format (as written by pull-models CLI)
 * 3. Verify model resolution works
 *
 * Note: Claude Agent SDK adapter works differently - it accepts model names
 * natively, so registerProviders just strips the provider prefix.
 */

import { describe, it, expect } from "vitest";
import { ClaudeAgentModelRegistry } from "../src";

describe("E2E: Seamless Pull-Models Flow (Claude Agent SDK)", () => {
  it("should wire anthropic/model through registry", () => {
    // Step 1: Create registry and register Anthropic provider
    const registry = new ClaudeAgentModelRegistry();
    registry.registerProviders({ anthropic: true });

    // Step 2: Get model config for provider/model format
    const config = registry.getModelConfig("anthropic/claude-3-5-haiku-20241022");

    // Step 3: Verify model config was created with stripped prefix
    expect(config).toBeDefined();
    expect(config.model).toBe("claude-3-5-haiku-20241022");
  });

  it("should support provider function for custom config", () => {
    // Step 1: Register provider as a function
    const registry = new ClaudeAgentModelRegistry();
    registry.registerProviders({
      anthropic: (modelId: string) => ({
        model: modelId,
        maxThinkingTokens: 10000,
      })
    });

    // Step 2: Get model config
    const config = registry.getModelConfig("anthropic/claude-3-opus-20240229-thinking");

    // Step 3: Verify custom config was applied
    expect(config).toBeDefined();
    expect(config.model).toContain("thinking");
    expect(config.maxThinkingTokens).toBe(10000);
  });

  it("should support multiple providers", () => {
    // Step 1: Register multiple providers
    const registry = new ClaudeAgentModelRegistry();
    registry.registerProviders({
      anthropic: true,
      openai: true,
    });

    // Step 2: Test both work
    const config1 = registry.getModelConfig("anthropic/claude-3-5-haiku-20241022");
    expect(config1.model).toBe("claude-3-5-haiku-20241022");

    const config2 = registry.getModelConfig("openai/gpt-4o");
    expect(config2.model).toBe("gpt-4o");
  });

  it("should work with bare model names (backward compatibility)", () => {
    const registry = new ClaudeAgentModelRegistry();

    const config = registry.getModelConfig("claude-3-5-haiku-20241022");
    expect(config.model).toBe("claude-3-5-haiku-20241022");
  });

  it("should handle model names with multiple slashes", () => {
    const registry = new ClaudeAgentModelRegistry();
    registry.registerProviders({ custom: true });

    const config = registry.getModelConfig("custom/org/model-name");

    // Should strip "custom" prefix but keep "org/model-name"
    expect(config.model).toBe("org/model-name");
  });

  it("should use default creator for unregistered provider", () => {
    const registry = new ClaudeAgentModelRegistry();

    const config = registry.getModelConfig("unregistered/some-model");

    // Default creator should pass the full model name through
    expect(config.model).toBe("unregistered/some-model");
  });

  it("should give explicit registration precedence over provider", () => {
    const registry = new ClaudeAgentModelRegistry();
    registry.registerProviders({ anthropic: true });
    registry.registerModels("anthropic/claude-3-5-haiku-20241022", (name) => ({
      model: "custom-override",
      custom: true,
    }));

    const config = registry.getModelConfig("anthropic/claude-3-5-haiku-20241022");
    expect(config.model).toBe("custom-override");
    expect(config.custom).toBe(true);
  });
});
