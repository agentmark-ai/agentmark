import { describe, it, expect, beforeAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark-ai/loader-file";
import { createAgentMark } from "../src/agentmark";
import { DefaultAdapter } from "../src/adapters/default";
import { setupFixtures } from "./setup-fixtures";

type TestPromptTypes = {
  "fixtures/math.prompt.mdx": {
    kind: "object";
    input: { userMessage: string };
    output: { answer: string };
  };
  "fixtures/image.prompt.mdx": {
    kind: "image";
    input: { userMessage: string };
    output: {};
  };
  "fixtures/speech.prompt.mdx": {
    kind: "speech";
    input: { userMessage: string };
    output: {};
  };
};

describe("AgentMark builtInModels validation", () => {
  const testDir = path.resolve(__dirname);
  const fileLoader = new FileLoader(testDir);

  beforeAll(async () => {
    await setupFixtures();
  });

  it("loads prompt successfully when builtInModels is not provided (no enforcement)", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
    });

    // "test-model" is not a valid provider/model, but no enforcement without builtInModels
    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).resolves.toBeDefined();
  });

  it("loads prompt successfully when model_name is in builtInModels", async () => {
    // The math fixture uses "test-model"
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["test-model", "openai/gpt-4o"],
    });

    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).resolves.toBeDefined();
  });

  it("throws when model_name is not in builtInModels (object prompt)", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["openai/gpt-4o", "anthropic/claude-3-haiku"],
    });

    // math.prompt.mdx uses "test-model" which is not in the list
    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).rejects.toThrow(
      'model_name "test-model" is not in builtInModels. Run agentmark pull-models to add it.'
    );
  });

  it("throws when model_name is not in builtInModels (image prompt)", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["openai/gpt-4o"],
    });

    // image.prompt.mdx uses "test-model"
    await expect(
      agentMark.loadImagePrompt("fixtures/image.prompt.mdx" as any)
    ).rejects.toThrow(
      'model_name "test-model" is not in builtInModels. Run agentmark pull-models to add it.'
    );
  });

  it("throws when model_name is not in builtInModels (speech prompt)", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["openai/gpt-4o"],
    });

    // speech.prompt.mdx uses "test-model"
    await expect(
      agentMark.loadSpeechPrompt("fixtures/speech.prompt.mdx" as any)
    ).rejects.toThrow(
      'model_name "test-model" is not in builtInModels. Run agentmark pull-models to add it.'
    );
  });

  it("does not enforce when builtInModels is an empty array", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: [],
    });

    // Empty array means no enforcement (user hasn't pulled any models yet)
    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).resolves.toBeDefined();
  });

  it("error message includes the unregistered model name", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["openai/gpt-4o"],
    });

    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).rejects.toThrow('"test-model"');
  });

  it("error message includes pull-models hint", async () => {
    const agentMark = createAgentMark({
      adapter: new DefaultAdapter<TestPromptTypes>(),
      loader: fileLoader,
      builtInModels: ["openai/gpt-4o"],
    });

    await expect(
      agentMark.loadObjectPrompt("fixtures/math.prompt.mdx" as any)
    ).rejects.toThrow("agentmark pull-models");
  });
});
