import { expect, test } from "vitest";
import { getMdxAst, getMdxPrompt } from "./helpers";
import "../builtin-plugins";
import { runInference, deserialize, serialize } from "../runtime";
import { vi } from "vitest";
import { openAIResponseWithNoStream, openAIResponseWithStream } from "./utils";
import { getFrontMatter, stringify } from "@puzzlet/templatedx";

vi.stubEnv("OPENAI_API_KEY", "key");

vi.mock("openai", () => ({
  default: vi.fn(() => ({
    chat: {
      completions: {
        create: vi.fn((params) => {
          if (params.stream) {
            return openAIResponseWithStream;
          }
          return openAIResponseWithNoStream;
        }),
      },
    },
  })),
}));

test("should deserialize", async () => {
  const ast = await getMdxAst(__dirname + "/mdx/basic.prompt.mdx");

  const deserialized = await deserialize(ast);

  expect(deserialized).toEqual({
    model: "gpt-4o-mini",
    top_p: 1,
    temperature: 0.7,
    messages: [
      {
        content: "What's 2 + 2?",
        role: "user",
      },
      {
        content: "5",
        role: "assistant",
      },
      {
        content: "Why are you bad at math?",
        role: "user",
      },
    ],
  });
});

test("should serialize", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/basic.prompt.mdx");
  const serialized = serialize(
    {
      model: "gpt-4o-mini",
      top_p: 1,
      temperature: 0.7,
      messages: [
        {
          content: "What's 2 + 2?",
          role: "user",
        },
        {
          content: "5",
          role: "assistant",
        },
        {
          content: "Why are you bad at math?",
          role: "user",
        },
      ],
    },
    "gpt-4o-mini",
    "basic-prompt"
  );

  expect(serialized).toEqual(mdx);
});

const openaiCompletionParamsWithTools = {
  model: "gpt-4o-mini",
  messages: [
    {
      role: "system",
      content:
        "You are a helpful assistant capable of solving basic math problems and using tools as needed.",
    },
    {
      role: "user",
      content: "What is 7 + 5?",
    },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "calculate",
        description: "Performs basic math calculations.",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "A mathematical expression to calculate.",
            },
          },
          required: ["expression"],
          additionalProperties: false,
        },
      },
    },
  ],
  temperature: 0.7,
  top_p: 1,
  stream: true,
};

test("should serialize tools", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/with-tools.prompt.mdx");

  const serialized = serialize(
    openaiCompletionParamsWithTools,
    "gpt-4o-mini",
    "calculate"
  );

  expect(serialized).toEqual(mdx);
});

test("should deserialize tools", async () => {
  const ast = await getMdxAst(__dirname + "/mdx/with-tools.prompt.mdx");
  const deserializedPrompt = await deserialize(ast);

  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithTools);
});

test("run inference with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/mdx/basic.prompt.mdx");

  const result = await runInference(ast);

  expect(result).toEqual([
    {
      output_type: "execute_result",
      data: "4",
      execution_count: 0,
      metadata: {
        finish_reason: "stop",
        id: "123",
        object: "chat.completion",
        created: 1669999999,
        model: "gpt-4o-mini",
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        raw_response: {
          content: "4",
          role: "assistant",
        },
        role: "assistant",
      },
    },
  ]);
});

test("run inference with stream", async () => {
  const ast = await getMdxAst(__dirname + "/mdx/basic-with-stream.prompt.mdx");

  const result = await runInference(ast);

  expect(result).toEqual([
    {
      output_type: "execute_result",
      data: "4",
      execution_count: 0,
      metadata: {
        finish_reason: "stop",
        raw_response: {
          content: "4",
          role: "assistant",
        },
      },
    },
  ]);
});


const promptWithHistory = {
  model: "gpt-4o-mini",
  top_p: 1,
  temperature: 0.7,
  messages: [
    {
      content: "What's 2 + 2?",
      role: "user",
    },
    {
      content: "5",
      role: "assistant",
    },
    {
      content: "What's 10 + 2?",
      role: "user",
    },
    {
      content: "5",
      role: "assistant",
    },
    {
      content: "Why are you bad at math?",
      role: "user",
    },
  ],
};

test("should deserialize prompt with history prop", async () => {
  const ast = await getMdxAst(__dirname + "/mdx/with-history.prompt.mdx");
  const frontmatter = getFrontMatter(ast) as any;
  const deserializedPrompt = await deserialize(ast, frontmatter.test_settings.props);

  expect(deserializedPrompt).toEqual(promptWithHistory);
});
