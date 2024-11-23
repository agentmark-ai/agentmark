import { expect, test } from "vitest";
import { getMdxAst, getMdxPrompt } from "../helpers";
import "../../plugins";
import { vi } from "vitest";
import { getFrontMatter } from "@puzzlet/templatedx";
import OpenAIChatPlugin from "../../plugins/openai-chat";
import { getRawConfig } from "../../runtime";
import { openaiCompletionParamsWithSchema, openaiCompletionParamsWithTools, promptWithHistory } from "./configs";

vi.stubEnv("OPENAI_API_KEY", "key");

const plugin = new OpenAIChatPlugin();

test("should deserialize", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserialized = await plugin.deserialize(promptDX);
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
  const mdx = await getMdxPrompt(__dirname + "/promptdx/basic.prompt.mdx");
  const serialized = plugin.serialize(
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
    "basic-prompt"
  );
  expect(serialized).toEqual(mdx);
});

test("should serialize tools with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/tools.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithTools(false),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/tools.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithTools(false));
});

test("should serialize tools with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/tools-stream.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithTools(true),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/tools-stream.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithTools(true));
});

test("should serialize schema with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/schema-stream.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithSchema(true),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/schema-stream.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithSchema(true));
});

test("should serialize schema with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/schema.prompt.mdx");

  const serialized = plugin.serialize(
    openaiCompletionParamsWithSchema(false),
    "calculate"
  );

  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/schema.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithSchema(false));
});

test("run inference with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic.prompt.mdx");
  const mockFetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: { content: 'Mocked response.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 200,
          statusText: 'OK',
        }
      )
    )
  );
  const pluginWithInference = new OpenAIChatPlugin(mockFetch);
  const promptDX = await getRawConfig(ast);
  const result = await pluginWithInference.runInference(promptDX);

  expect(result).toEqual(
    {
      finishReason: "stop",
      result: {
        data: "Mocked response.",
        type: "text"
      },
      tools: [],
      usage: {
        completionTokens: 10,
        promptTokens: 5,
        totalTokens: 15,
      }
    },
  );
});

test("run inference with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic-stream.prompt.mdx");
  const mockStreamedFetch = vi.fn(() => {
    const stream = new ReadableStream({
      start(controller) {
        const chunks = [
          JSON.stringify({
            choices: [
              {
                delta: { content: 'Mocked ' },
                index: 0,
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                delta: { content: 'response.' },
                index: 0,
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 10,
              total_tokens: 15,
            },
          }),
        ];
  
        chunks.forEach((chunk, index) => {
          controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\n`));
          if (index === chunks.length - 1) {
            controller.close();
          }
        });
      },
    });
  
    return Promise.resolve(
      new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream' },
        status: 200,
        statusText: 'OK',
      })
    );
  });

  const pluginWithInference = new OpenAIChatPlugin(mockStreamedFetch);
  const promptDX = await getRawConfig(ast);
  const result = await pluginWithInference.runInference(promptDX);
  expect(result).toEqual(
    {
      finishReason: "stop",
      result: {
        data: "Mocked response.",
        type: "text"
      },
      tools: [],
      usage: {
        completionTokens: 10,
        promptTokens: 5,
        totalTokens: 15,
      }
    },
  );
});

test("should deserialize prompt with history prop", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/props-history.prompt.mdx");
  const frontmatter = getFrontMatter(ast) as any;
  const promptDX = await getRawConfig(ast, frontmatter.test_settings.props);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(promptWithHistory);
});
