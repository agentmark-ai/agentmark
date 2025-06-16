import { describe, it, expect } from "vitest";
import path from "path";
import { createAgentMarkClient } from "@agentmark/default-adapter";
import { FileLoader } from "../src/loaders/file";

type TestPromptTypes = {
  "math.prompt.mdx": {
    kind: "object";
    input: { userMessage: string };
    output: { answer: string };
  };
  "image.prompt.mdx": {
    kind: "image";
    input: { userMessage: string };
    output: { answer: string };
  };
  "attachments.prompt.mdx": {
    kind: "object";
    input: { userMessage: string; fileMimeType: string; imageLink: string };
    output: { answer: string };
  };
  "incorrectAttachments.prompt.mdx": {
    kind: "object";
    input: {};
    output: { answer: string };
  };
  "incorrectImage.prompt.mdx": {
    kind: "image";
    input: { userMessage: string };
    output: never;
  };
  "speech.prompt.mdx": {
    kind: "speech";
    input: { userMessage: string };
    output: { answer: string };
  };
  "mathDataset.prompt.mdx": {
    kind: "object";
    input: { userMessage: string };
    output: { answer: string };
  };
};

describe("AgentMark Integration", () => {
  const fixturesDir = path.resolve(__dirname, "./fixtures");
  const fileLoader = new FileLoader(fixturesDir);
  const agentMark = createAgentMarkClient<TestPromptTypes>({
    loader: fileLoader,
  });

  it("should load and compile prompts with type safety", async () => {
    const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const result = await mathPrompt.format({
      props: {
        userMessage: "What is the sum of 5 and 3?",
      },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe("math");
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toBe("You are a helpful math tutor.");
    expect(result.messages[1].role).toBe("user");
    expect(result.messages[1].content).toBe("What is the sum of 5 and 3?");
    expect(result.messages[2].role).toBe("assistant");
    expect(result.messages[2].content).toBe("Here's your answer!");
  });

  it("should load and compile object prompt with type safety", async () => {
    const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const result = await mathPrompt.format({
      userMessage: "What is the sum of 5 and 3?",
    });
    expect(result.object_config.model_name).toBe("test-model");
    expect(result.object_config.schema).toBeDefined();
    expect(result.object_config.schema.properties.answer).toBeDefined();
  });

  it("should load and compile image prompt with type safety", async () => {
    const imagePrompt = await agentMark.loadImagePrompt("image.prompt.mdx");
    const result = await imagePrompt.format({
      props: {
        userMessage: "Design an image showing a triangle and a circle.",
      },
    });
    expect(result.image_config.prompt).toBe(
      "This is a test for the image prompt to be drawn."
    );
    expect(result.image_config.model_name).toBe("test-model");
    expect(result.image_config.num_images).toBe(1);
    expect(result.image_config.size).toBe("1024x1024");
    expect(result.image_config.aspect_ratio).toBe("1:1");
    expect(result.image_config.seed).toBe(12345);
  });

  it("should load and compile speech prompt with type safety", async () => {
    const speechPrompt = await agentMark.loadSpeechPrompt("speech.prompt.mdx");
    const result = await speechPrompt.format({
      userMessage: "Generate a speech for the given text.",
    });
    expect(result.speech_config.model_name).toBe("test-model");
    expect(result.speech_config.text).toBe(
      "This is a test for the speech prompt to be spoken aloud."
    );
    expect(result.speech_config.voice).toBe("nova");
    expect(result.speech_config.output_format).toBe("mp3");
    expect(result.speech_config.instructions).toBe(
      "Please read this text aloud."
    );
    expect(result.speech_config.speed).toBe(1.0);
  });

  it("should throw an error for invalid prompt tags", async () => {
    await expect(
      agentMark.loadImagePrompt("incorrectImage.prompt.mdx")
    ).rejects.toThrowError(
      "ImagePrompt and System tags cannot be used together."
    );
  });

  it("should enforce type safety on prompt paths", () => {
    expect(async () => {
      await agentMark.loadObjectPrompt("math.prompt.mdx");
    }).not.toThrow();
  });

  it("should enforce type safety on input props", async () => {
    const mathPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const result = await mathPrompt.format({
      props: { userMessage: "What is 2+2?" },
    });
    expect(result.messages[1].content).toBe("What is 2+2?");
  });

  it("should work with preloaded prompt objects", async () => {
    const originalPrompt = await agentMark.loadObjectPrompt("math.prompt.mdx");
    const preloadedTemplate = originalPrompt.template;
    const preloadedPrompt = await agentMark.loadObjectPrompt(
      preloadedTemplate as any
    );
    const result = await preloadedPrompt.format({
      props: { userMessage: "What is the sum of 5 and 3?" },
    });

    expect(result).toBeDefined();
    expect(result.name).toBe("math");
    expect(result.messages).toHaveLength(3);
    expect(result.messages[0].role).toBe("system");
    expect(result.messages[0].content).toBe("You are a helpful math tutor.");
    expect(result.messages[1].role).toBe("user");
    expect(result.messages[1].content).toBe("What is the sum of 5 and 3?");
    expect(result.messages[2].role).toBe("assistant");
    expect(result.messages[2].content).toBe("Here's your answer!");

    expect(result.object_config.model_name).toBe("test-model");
    expect(result.object_config.schema).toBeDefined();
    expect(result.object_config.schema.properties.answer).toBeDefined();
  });

  it("should extract rich content from <User> including images, files, and text (with looped mimeTypes)", async () => {
    const prompt = await agentMark.loadObjectPrompt("attachments.prompt.mdx");
    const result = await prompt.format({
      props: {
        userMessage: "Take a look at those attachments.",
        fileMimeType: "application/pdf",
        imageLink: "https://example.com/image.png",
      },
    });

    const userMessage = result.messages.find((m) => m.role === "user");
    expect(userMessage).toBeDefined();

    const content = userMessage!.content;
    expect(Array.isArray(content)).toBe(true);
    expect(content).toHaveLength(5); // 1 text + 1 image + 1 file + 2 looped images

    const parts = content;

    expect(parts).toEqual([
      { type: "text", text: "hello!!!!Take a look at those attachments." },
      { type: "image", image: "https://example.com/image.png" },
      {
        type: "file",
        data: "https://example.com/document.pdf",
        mimeType: "application/pdf",
      },
      {
        type: "image",
        image: "https://example.com/loop.png",
        mimeType: "image/jpeg",
      },
      {
        type: "image",
        image: "https://example.com/loop.png",
        mimeType: "image/png",
      },
    ]);
  });

  it("should throw an error if the attachments are not inside User tag only", async () => {
    await expect(
      agentMark.loadObjectPrompt("incorrectAttachments.prompt.mdx")
    ).rejects.toThrowError(
      "Error processing MDX JSX Element: ImageAttachment and FileAttachment tags must be inside User tag."
    );
  });

  it("should handle formatting with data sets", async () => {
    const prompt = await agentMark.loadObjectPrompt("mathDataset.prompt.mdx");
    const vercelInputs = prompt.formatWithDataset({});

    let entryIndex = 1;
    for await (const input of vercelInputs) {
      expect(input).toBeDefined();
      expect(input.name).toBe("mathDatasetOps");
      expect(input.messages).toHaveLength(3);
      expect(input.messages[0].role).toBe("system");
      expect(input.messages[0].content).toBe("You are a helpful math tutor.");
      if (entryIndex === 1) {
        expect(input.messages[1].role).toBe("user");
        expect(input.messages[1].content).toBe("What is 5 + 7?");
      } else if (entryIndex === 2) {
        expect(input.messages[1].role).toBe("user");
        expect(input.messages[1].content).toBe("Calculate 10 - 3.");
      }
      expect(input.messages[2].role).toBe("assistant");
      expect(input.messages[2].content).toBe("Here's your answer!");
      entryIndex++;
    }
  });
});
