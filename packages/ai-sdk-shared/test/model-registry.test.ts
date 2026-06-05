/**
 * Unit tests for the shared VercelAIModelRegistry — the canonical home of
 * the registry logic after the v4/v5 dedup.
 *
 * The v4/v5 adapters keep their own registry tests against their typed
 * subclasses, but mutation testing showed this package's own suite had
 * ZERO direct coverage of the implementation it now owns (31 surviving
 * mutants). These tests pin the resolution semantics at the source.
 */
import { describe, it, expect, vi } from "vitest";
import { VercelAIModelRegistry } from "../src/model-registry.js";

type Model = { id: string; kind?: string };

const creatorFor =
  (id: string) =>
  (_name: string): Model => ({ id });

describe("registerModels — pattern forms", () => {
  it("resolves exact string matches", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerModels("gpt-4o", creatorFor("exact"));
    expect(registry.getModelFunction("gpt-4o")("gpt-4o")).toEqual({
      id: "exact",
    });
  });

  it("registers every name in an array", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerModels(["m1", "m2"], creatorFor("array"));
    expect(registry.getModelFunction("m1")("m1")).toEqual({ id: "array" });
    expect(registry.getModelFunction("m2")("m2")).toEqual({ id: "array" });
  });

  it("resolves regex patterns when no exact match exists", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerModels(/^claude-/, creatorFor("pattern"));
    expect(registry.getModelFunction("claude-sonnet")("claude-sonnet")).toEqual(
      { id: "pattern" }
    );
  });

  it("patterns only match names they actually test true for", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerModels(/^claude-/, creatorFor("pattern"));
    // A registered pattern must not become a catch-all for unrelated names.
    expect(() => registry.getModelFunction("gpt-4o")).toThrow(
      "No model function found for: 'gpt-4o'."
    );
  });

  it("prefers exact matches over patterns", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerModels(/^gpt-/, creatorFor("pattern"));
    registry.registerModels("gpt-4o", creatorFor("exact"));
    expect(registry.getModelFunction("gpt-4o")("gpt-4o")).toEqual({
      id: "exact",
    });
  });
});

describe("provider/model resolution", () => {
  function fakeProvider() {
    return {
      languageModel: vi.fn((modelId: string): Model => ({ id: modelId, kind: "lm" })),
      imageModel: vi.fn((modelId: string): Model => ({ id: modelId, kind: "img" })),
    };
  }

  it("splits on the FIRST slash and passes the remainder as modelId", () => {
    const openai = fakeProvider();
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerProviders({ openai });

    const model = registry.getModelFunction("openai/ft:gpt/4o")("openai/ft:gpt/4o");

    // indexOf (not lastIndexOf): provider = "openai", modelId keeps its slash.
    expect(openai.languageModel).toHaveBeenCalledWith("ft:gpt/4o");
    expect(model).toEqual({ id: "ft:gpt/4o", kind: "lm" });
  });

  it("defaults to languageModel and selects imageModel when asked", () => {
    const openai = fakeProvider();
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerProviders({ openai });

    expect(registry.getModelFunction("openai/gpt-4o")("openai/gpt-4o")).toEqual(
      { id: "gpt-4o", kind: "lm" }
    );
    expect(
      registry.getModelFunction("openai/dall-e-3", "imageModel")("openai/dall-e-3")
    ).toEqual({ id: "dall-e-3", kind: "img" });
    expect(openai.imageModel).toHaveBeenCalledWith("dall-e-3");
  });

  it("throws on malformed provider/model names (empty halves)", () => {
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerProviders({ openai: fakeProvider() });

    expect(() => registry.getModelFunction("/gpt-4o")).toThrow(
      "Invalid model name format: '/gpt-4o'. Expected 'provider/model'."
    );
    expect(() => registry.getModelFunction("openai/")).toThrow(
      "Invalid model name format: 'openai/'. Expected 'provider/model'."
    );
  });

  it("throws an actionable error for unregistered providers", () => {
    const registry = new VercelAIModelRegistry<Model>();
    expect(() => registry.getModelFunction("anthropic/claude-3")).toThrow(
      "Provider 'anthropic' is not registered. Add .registerProviders({ anthropic }) to your model registry."
    );
  });

  it("throws when the provider lacks the requested model type", () => {
    const speechOnly = {
      speechModel: (modelId: string): Model => ({ id: modelId, kind: "speech" }),
    };
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerProviders({ eleven: speechOnly });

    expect(() =>
      registry.getModelFunction("eleven/voice-1", "imageModel")
    ).toThrow(
      "Provider 'eleven' does not support imageModel models. The model 'eleven/voice-1' cannot be created as a imageModel."
    );
  });

  it("binds the factory to its provider (this-dependent providers work)", () => {
    const provider = {
      prefix: "bound:",
      languageModel(this: { prefix: string }, modelId: string): Model {
        return { id: this.prefix + modelId };
      },
    };
    const registry = new VercelAIModelRegistry<Model>();
    registry.registerProviders({ p: provider });

    expect(registry.getModelFunction("p/m")("p/m")).toEqual({ id: "bound:m" });
  });
});

describe("fallback ordering", () => {
  it("uses the defaultCreator only when nothing else matches", () => {
    const registry = new VercelAIModelRegistry<Model>(creatorFor("default"));
    registry.registerModels("known", creatorFor("known"));

    expect(registry.getModelFunction("known")("known")).toEqual({
      id: "known",
    });
    expect(registry.getModelFunction("mystery")("mystery")).toEqual({
      id: "default",
    });
  });

  it("throws the registration hint when nothing matches and no default exists", () => {
    const registry = new VercelAIModelRegistry<Model>();
    expect(() => registry.getModelFunction("mystery")).toThrow(
      "No model function found for: 'mystery'. Register it with .registerModels() or use provider/model format with .registerProviders()."
    );
  });
});
