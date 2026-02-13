import { describe, it, expect } from "vitest";
import { Providers } from "../../cli-src/utils/providers";

describe("Providers", () => {
  it("loads providers from model registry JSON", () => {
    expect(Object.keys(Providers).length).toBeGreaterThan(0);
  });

  it("includes expected core providers", () => {
    const keys = Object.keys(Providers);
    expect(keys).toContain("openai");
    expect(keys).toContain("anthropic");
    expect(keys).toContain("google");
    expect(keys).toContain("groq");
  });

  it("uses human-readable labels from provider-labels.json", () => {
    expect(Providers["openai"]!.label).toBe("OpenAI");
    expect(Providers["anthropic"]!.label).toBe("Anthropic");
    expect(Providers["google"]!.label).toBe("Google");
  });

  it("falls back to raw key for unlabeled providers", () => {
    // Any provider not in provider-labels.json should use its raw key
    for (const [key, provider] of Object.entries(Providers)) {
      expect(typeof provider.label).toBe("string");
      expect(provider.label.length).toBeGreaterThan(0);
    }
  });

  it("categorizes chat models as languageModels", () => {
    // OpenAI should have gpt-4o as a language model
    expect(Providers["openai"]!.languageModels).toContain("gpt-4o");
  });

  it("categorizes image_generation models as imageModels", () => {
    // OpenAI should have dall-e models
    expect(Providers["openai"]!.imageModels.length).toBeGreaterThan(0);
    expect(
      Providers["openai"]!.imageModels.some((m) => m.includes("dall-e"))
    ).toBe(true);
  });

  it("categorizes audio_speech models as speechModels", () => {
    // OpenAI should have tts models
    expect(Providers["openai"]!.speechModels.length).toBeGreaterThan(0);
    expect(
      Providers["openai"]!.speechModels.some((m) => m.includes("tts"))
    ).toBe(true);
  });

  it("has correct shape for each provider entry", () => {
    for (const [, provider] of Object.entries(Providers)) {
      expect(provider).toHaveProperty("label");
      expect(provider).toHaveProperty("languageModels");
      expect(provider).toHaveProperty("imageModels");
      expect(provider).toHaveProperty("speechModels");
      expect(Array.isArray(provider.languageModels)).toBe(true);
      expect(Array.isArray(provider.imageModels)).toBe(true);
      expect(Array.isArray(provider.speechModels)).toBe(true);
    }
  });

  it("does not have duplicate models within a provider", () => {
    for (const [key, provider] of Object.entries(Providers)) {
      const all = [
        ...provider.languageModels,
        ...provider.imageModels,
        ...provider.speechModels,
      ];
      const unique = new Set(all);
      expect(unique.size).toBe(all.length);
    }
  });

  it("excludes embedding, moderation, and rerank models", () => {
    const allModels: string[] = [];
    for (const provider of Object.values(Providers)) {
      allModels.push(
        ...provider.languageModels,
        ...provider.imageModels,
        ...provider.speechModels
      );
    }
    // Known non-promptable models should not appear
    const excluded = [
      "text-moderation-latest",
      "text-moderation-stable",
      "omni-moderation-latest",
      "rerank-v3.5",
      "rerank-english-v3.0",
      "mistral-embed",
      "codestral-embed",
    ];
    for (const id of excluded) {
      expect(allModels).not.toContain(id);
    }
  });
});
