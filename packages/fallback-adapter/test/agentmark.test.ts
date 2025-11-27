import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import { FileLoader } from "@agentmark/prompt-core";
import { createAgentMarkClient } from "../src";
import { setupFixtures, cleanupFixtures } from "./setup-fixtures";

type TestPromptTypes = {
  "math.prompt.mdx": {
    input: { userMessage: string };
    output: { answer: string };
  };
  "image.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
  "text.prompt.mdx": {
    input: { userMessage: string };
    output: never;
  };
};

describe("AgentMark Integration", () => {
  // Build pre-compiled fixtures before tests run
  beforeAll(async () => {
    await setupFixtures();
  });

  // Clean up generated fixtures after tests
  afterAll(() => {
    cleanupFixtures();
  });

  describe("Default Adapter Integration", () => {
    it("should adapt object prompts for the default adapter", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
      });

      const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe("system");
      expect(result.messages[0].content).toBe("You are a helpful math tutor.");
      expect(result.messages[1].role).toBe("user");
      expect(result.messages[1].content).toBe("What is the sum of 5 and 3?");
      expect(result.object_config.model_name).toBeDefined();
      expect(result.object_config.schema).toBeDefined();
    });

    it("should adapt text prompts for the default adapter", async () => {
      const fixturesDir = path.resolve(__dirname, "./fixtures");
      const fileLoader = new FileLoader(fixturesDir);

      const agentMark = createAgentMarkClient<TestPromptTypes>({
        loader: fileLoader,
      });

      const mathPrompt = await agentMark.loadTextPrompt("text.prompt.mdx");
      const result = await mathPrompt.format({
        props: {
          userMessage: "What is the sum of 5 and 3?",
        },
      });

      expect(result).toBeDefined();
      expect(result.messages).toHaveLength(3);
      expect(result.text_config.model_name).toEqual("test-model");
    });
  });
});
