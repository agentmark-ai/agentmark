import { expect, test } from "vitest";
import { vi } from "vitest";
import { getFrontMatter, load } from "@puzzlet/templatedx";
import {
  PluginAPI,
  ToolPluginRegistry,
  getRawConfig,
} from "@puzzlet/agentmark";
import OpenAIChatPlugin from "../src";
import fs from "fs";
import {
  openaiCompletionParamsWithSchema,
  openaiCompletionParamsWithTools,
  promptWithHistory,
} from "./configs";

vi.stubEnv("OPENAI_API_KEY", "key");

const plugin = new OpenAIChatPlugin();

export const getMdxPrompt = async (path: string) => {
  const input = fs.readFileSync(path, "utf-8");
  return input;
};

test("should deserialize", async () => {
  const ast = await load(__dirname + "/mdx/basic.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const deserialized = await plugin.deserialize(agentMark, PluginAPI);
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
    "basic-prompt",
    PluginAPI
  );
  expect(serialized).toEqual(mdx);
});

test("should serialize tools with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/tools.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithTools(false),
    "tools",
    PluginAPI
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with no stream", async () => {
  const ast = await load(__dirname + "/mdx/tools.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(agentMark, PluginAPI);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithTools(false));
});

test("should serialize tools with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/tools-stream.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithTools(true),
    "tools",
    PluginAPI
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize tools with stream", async () => {
  const ast = await load(__dirname + "/mdx/tools-stream.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(agentMark, PluginAPI, {
    withStream: true,
  });
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithTools(true));
});

test("should serialize schema with stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/schema-stream.prompt.mdx");
  const serialized = plugin.serialize(
    openaiCompletionParamsWithSchema(true),
    "schema",
    PluginAPI
  );
  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with stream", async () => {
  const ast = await load(__dirname + "/mdx/schema-stream.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(agentMark, PluginAPI, {
    withStream: true,
  });
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithSchema(true));
});

test("should serialize schema with no stream", async () => {
  const mdx = await getMdxPrompt(__dirname + "/mdx/schema.prompt.mdx");

  const serialized = plugin.serialize(
    openaiCompletionParamsWithSchema(false),
    "schema",
    PluginAPI
  );

  expect(serialized).toEqual(mdx);
});

test("should deserialize schema with no stream", async () => {
  const ast = await load(__dirname + "/mdx/schema.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const deserializedPrompt = await plugin.deserialize(agentMark, PluginAPI);
  expect(deserializedPrompt).toEqual(openaiCompletionParamsWithSchema(false));
});

test("should generate text", async () => {
  const ast = await load(__dirname + "/mdx/basic.prompt.mdx");
  const mockFetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: { content: "Mocked response." },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
          statusText: "OK",
        }
      )
    )
  );
  const api = { ...PluginAPI, fetch: mockFetch };
  const pluginWithInference = new OpenAIChatPlugin();
  const agentMark = await getRawConfig(ast);
  const { text, usage, version } = await pluginWithInference.generateText(
    agentMark,
    api
  );

  expect({ text, usage, version }).toEqual({
    text: "Mocked response.",
    usage: {
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    },
    version: "v3.0",
  });
});

test("should stream text", async () => {
  const ast = await load(__dirname + "/mdx/basic-stream.prompt.mdx");
  const mockStreamedFetch = vi.fn(() => {
    const stream = new ReadableStream({
      start(controller) {
        const chunks = [
          JSON.stringify({
            choices: [
              {
                delta: { content: "Mocked " },
                index: 0,
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                delta: { content: "response." },
                index: 0,
                finish_reason: "stop",
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
        headers: { "Content-Type": "text/event-stream" },
        status: 200,
        statusText: "OK",
      })
    );
  });
  const api = { ...PluginAPI, fetch: mockStreamedFetch };
  const pluginWithInference = new OpenAIChatPlugin();
  const agentMark = await getRawConfig(ast);
  const resultWithStream = await pluginWithInference.streamText(agentMark, api);

  let message = "";
  for await (const chunk of resultWithStream.textStream) {
    message += chunk;
  }

  const result = {
    text: message,
    usage: await resultWithStream.usage,
    version: resultWithStream.version,
  };

  expect(result).toEqual({
    text: "Mocked response.",
    usage: {
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    },
    version: "v3.0",
  });
});

test("should generate object", async () => {
  const ast = await load(__dirname + "/mdx/schema.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const mockFetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_xyz",
                    type: "function",
                    function: {
                      name: "parse_response",
                      arguments: JSON.stringify({
                        names: [
                          "Jessica",
                          "Michael",
                          "Emily",
                          "David",
                          "Sarah",
                        ],
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
          statusText: "OK",
        }
      )
    )
  );
  const api = { ...PluginAPI, fetch: mockFetch };
  const pluginWithInference = new OpenAIChatPlugin();
  const result = await pluginWithInference.generateObject(agentMark, api);
  expect({
    result: result.object,
    usage: result.usage,
    version: result.version,
  }).toEqual({
    result: {
      names: ["Jessica", "Michael", "Emily", "David", "Sarah"],
    },
    usage: {
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    },
    version: "v3.0",
  });
});

test("should stream object", async () => {
  const ast = await load(__dirname + "/mdx/schema-stream.prompt.mdx");
  const agentMark = await getRawConfig(ast);
  const mockStreamedFetch = vi.fn(() => {
    const stream = new ReadableStream({
      start(controller) {
        const chunks = [
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_xyz",
                      type: "function",
                      function: {
                        name: "parse_response",
                      },
                    },
                  ],
                },
                index: 0,
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: '{"names":[',
                      },
                    },
                  ],
                },
                index: 0,
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: '"Jessica","Michael",',
                      },
                    },
                  ],
                },
                index: 0,
                finish_reason: null,
              },
            ],
          }),
          JSON.stringify({
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: {
                        arguments: '"Emily","David","Sarah"]}',
                      },
                    },
                  ],
                },
                index: 0,
                finish_reason: "tool_calls",
              },
            ],
            usage: {
              prompt_tokens: 5,
              completion_tokens: 10,
              total_tokens: 15,
            },
          }),
          "[DONE]",
        ];

        chunks.forEach((chunk) => {
          controller.enqueue(new TextEncoder().encode(`data: ${chunk}\n\n`));
        });
        controller.close();
      },
    });

    return Promise.resolve(
      new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
        status: 200,
        statusText: "OK",
      })
    );
  });

  const api = { ...PluginAPI, fetch: mockStreamedFetch };
  const pluginWithInference = new OpenAIChatPlugin();
  const resultWithStream = await pluginWithInference.streamObject(
    agentMark,
    api
  );

  let object: any = {};
  let chunkCount = 0;

  for await (const chunk of resultWithStream.partialObjectStream) {
    chunkCount++;
    object = chunk;
  }

  const result = {
    object,
    usage: await resultWithStream.usage,
    version: resultWithStream.version,
  };

  expect(result).toEqual({
    object: {
      names: ["Jessica", "Michael", "Emily", "David", "Sarah"],
    },
    usage: {
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    },
    version: "v3.0",
  });
});

test("should deserialize prompt with history prop", async () => {
  const ast = await load(__dirname + "/mdx/props-history.prompt.mdx");
  const frontmatter = getFrontMatter(ast) as any;
  const agentMark = await getRawConfig(ast, frontmatter.test_settings.props);
  const deserializedPrompt = await plugin.deserialize(agentMark, PluginAPI);
  expect(deserializedPrompt).toEqual(promptWithHistory);
});

test("should generate text with tools", async () => {
  ToolPluginRegistry.register(async ({ location }: { location: string }) => {
    return `Cold af in ${location}`;
  }, "weather");
  const ast = await load(__dirname + "/mdx/tools.prompt.mdx");
  const mockFetch = vi.fn(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_xyz",
                    type: "function",
                    function: {
                      name: "weather",
                      arguments: JSON.stringify({
                        location: "London",
                        unit: "celsius",
                      }),
                    },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
          statusText: "OK",
        }
      )
    )
  );
  const api = { ...PluginAPI, fetch: mockFetch };
  const pluginWithInference = new OpenAIChatPlugin();
  const agentMark = await getRawConfig(ast);
  const { text, usage, version, finishReason, toolCalls, toolResults } =
    await pluginWithInference.generateText(agentMark, api);
  

  expect({
    text,
    usage,
    version,
    finishReason,
    toolCalls,
    toolResults,
  }).toEqual({
    text: "",
    toolCalls: [
      {
        toolCallId: "call_xyz",
        type: "tool-call",
        args: {
          location: "London",
          unit: "celsius",
        },
        toolName: "weather",
      },
    ],
    toolResults: [
      {
        toolCallId: "call_xyz",
        type: "tool-result",
        result: "Cold af in London",
        toolName: "weather",
        args: {
          location: "London",
          unit: "celsius",
        },
      },
    ],
    usage: {
      completionTokens: 10,
      promptTokens: 5,
      totalTokens: 15,
    },
    finishReason: "tool-calls",
    version: "v3.0",
  });
});
