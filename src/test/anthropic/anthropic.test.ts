import { expect, test } from "vitest";
import { getMdxAst, getMdxPrompt } from "../helpers";
import { vi } from "vitest";
import { getFrontMatter } from "@puzzlet/templatedx";
import AnthropicChatPlugin from "../../model-plugins/anthropic-chat";
import { getRawConfig } from "../../runtime";
import { anthropicCompletionParamsWithSchema, anthropicCompletionParamsWithTools, promptWithHistory } from "./configs";

vi.stubEnv("ANTHROPIC_API_KEY", "key");

const plugin = new AnthropicChatPlugin();


test("should serialize basic", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/basic.prompt.mdx");
  const serialized = plugin.serialize(
    {
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: [
            {
              text: "What's 2 + 2?",
              type: 'text',
            },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              text: '5',
              type: 'text',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              text: 'Why are you bad at math?',
              type: 'text',
            },
          ],
        },
      ],
      model: 'claude-3-5-haiku-latest',
      temperature: 0.7,
      top_p: 1,
    },
    "basic-prompt"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize basic", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserialized = await plugin.deserialize(promptDX);
  expect(deserialized).toEqual({
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            text: "What's 2 + 2?",
            type: 'text',
          },
        ],
      },
      {
        role: 'assistant',
        content: [
          {
            text: '5',
            type: 'text',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            text: 'Why are you bad at math?',
            type: 'text',
          },
        ],
      },
    ],
    model: 'claude-3-5-haiku-latest',
    temperature: 0.7,
    top_p: 1,
  });
});

test("should serialize tools with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/tools.prompt.mdx");
  const serialized = plugin.serialize(
    anthropicCompletionParamsWithTools(false),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/tools.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(anthropicCompletionParamsWithTools(false));
});

test("should serialize tools with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/tools-stream.prompt.mdx");
  const serialized = plugin.serialize(
    anthropicCompletionParamsWithTools(true),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/tools-stream.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(anthropicCompletionParamsWithTools(true));
});

test("should serialize schema with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/schema-stream.prompt.mdx");
  const serialized = plugin.serialize(
    anthropicCompletionParamsWithSchema(true),
    "calculate"
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/schema-stream.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(anthropicCompletionParamsWithSchema(true));
});

test("should serialize schema with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/promptdx/schema.prompt.mdx");

  const serialized = plugin.serialize(
    anthropicCompletionParamsWithSchema(false),
    "calculate"
  );

  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/schema.prompt.mdx");
  const promptDX = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(anthropicCompletionParamsWithSchema(false));
});

test("run inference with no stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic.prompt.mdx");
  const mockFetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          type: "message",
          content: [
            {
              type: "text",
              role: "assistant",
              text: "Mocked response."
            }
          ],
          stop_reason: "stop_sequence",
          truncated: false,
          tokens_consumed: 15,
          model: "claude-3-5-sonnet-latest",
          usage: {
            input_tokens: 10,
            output_tokens: 15,
            total_tokens: 25
          }
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
          statusText: "OK"
        }
      )
    )
  );  
  
  
  const pluginWithInference = new AnthropicChatPlugin(mockFetch);
  const promptDX = await getRawConfig(ast);
  const result = await pluginWithInference.runInference(promptDX);

  expect(result).toEqual({
    finishReason: "stop",
    result: {
      text: "Mocked response.",
    },
    tools: [],
    usage: {
      completionTokens: 15,
      promptTokens: 10,
      totalTokens: 25,
    },
  });
});

test("should deserialize prompt with history prop", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/props-history.prompt.mdx");
  const frontmatter = getFrontMatter(ast) as any;
  const promptDX = await getRawConfig(ast, frontmatter.test_settings.props);
  const deserializedPrompt = await plugin.deserialize(promptDX);
  expect(deserializedPrompt).toEqual(promptWithHistory);
});

test("run inference with stream", async () => {
  const ast = await getMdxAst(__dirname + "/promptdx/basic-stream.prompt.mdx");
  const mockStreamedFetch = vi.fn(() => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const events = [
          {
            event: "message_start",
            data: {
              type: "message_start",
              message: {
                id: "msg_mock_1",
                type: "message",
                role: "assistant",
                content: [],
                model: "claude-3-5-sonnet-latest",
                stop_reason: null,
                stop_sequence: null,
                usage: { input_tokens: 10, output_tokens: 0, total_tokens: 10 }
              }
            }
          },
          {
            event: "content_block_start",
            data: {
              type: "content_block_start",
              index: 0,
              content_block: { type: "text", text: "" }
            }
          },
          {
            event: "content_block_delta",
            data: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "Mocked " }
            }
          },
          {
            event: "content_block_delta",
            data: {
              type: "content_block_delta",
              index: 0,
              delta: { type: "text_delta", text: "response." }
            }
          },
          {
            event: "content_block_stop",
            data: {
              type: "content_block_stop",
              index: 0
            }
          },
          {
            event: "message_delta",
            data: {
              type: "message_delta",
              delta: { stop_reason: "stop_sequence", stop_sequence: null },
              usage: { input_tokens: 10, output_tokens: 15, total_tokens: 25 }
            }
          },
          {
            event: "message_stop",
            data: { type: "message_stop" }
          }
        ];
  
        events.forEach((event) => {
          const sseMessage = `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
          controller.enqueue(encoder.encode(sseMessage));
        });
  
        controller.close();
      }
    });
  
    return Promise.resolve(
      new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
        status: 200,
        statusText: "OK"
      })
    );
  });
  
  

  const pluginWithInference = new AnthropicChatPlugin(mockStreamedFetch);
  const promptDX = await getRawConfig(ast);
  const result = await pluginWithInference.runInference(promptDX);
  expect(result).toEqual({
    finishReason: "stop",
    result: {
      text: "Mocked response.",
    },
    tools: [],
    usage: {
      completionTokens: 15,
      totalTokens: 25,
      promptTokens: 10,
    },
  });
});
