import { describe, it, expect } from "vitest";
import {
  IndexedMessageConfig,
  parseIndexedMessages,
  extractIndexedToolCalls,
  messagesToPlainText,
} from "../../src/normalizer/extractors/indexed-message-parser";

// OpenInference-shaped config (message. infix, function.* tool-call keys).
const OI: IndexedMessageConfig = {
  prefix: "llm.input_messages",
  messageInfix: "message.",
  contentsKey: "contents",
  contentsPartInfix: "message_content.",
  toolCalls: {
    arrayKey: "tool_calls",
    infix: "tool_call.",
    idKey: "id",
    nameKey: "function.name",
    argsKey: "function.arguments",
  },
};

// OpenLLMetry-shaped config (no infixes).
const OLLM: IndexedMessageConfig = {
  prefix: "gen_ai.prompt",
  messageInfix: "",
  toolCalls: { arrayKey: "tool_calls", infix: "", idKey: "id", nameKey: "name", argsKey: "arguments" },
};

describe("parseIndexedMessages", () => {
  it("reconstructs ordered scalar-content messages (OpenInference shape)", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "system",
          "llm.input_messages.0.message.content": "You are helpful",
          "llm.input_messages.1.message.role": "user",
          "llm.input_messages.1.message.content": "Hi",
        },
        OI
      )
    ).toEqual([
      { role: "system", content: "You are helpful" },
      { role: "user", content: "Hi" },
    ]);
  });

  it("reconstructs messages emitted out of order, sorted by index (catches reorder bugs)", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.1.role": "user",
          "gen_ai.prompt.1.content": "second",
          "gen_ai.prompt.0.role": "system",
          "gen_ai.prompt.0.content": "first",
        },
        OLLM
      )
    ).toEqual([
      { role: "system", content: "first" },
      { role: "user", content: "second" },
    ]);
  });

  it("tolerates sparse indices (a gap does not drop later messages)", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.0.role": "user",
          "gen_ai.prompt.0.content": "a",
          "gen_ai.prompt.2.role": "assistant",
          "gen_ai.prompt.2.content": "b",
        },
        OLLM
      )
    ).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("embeds tool calls as content parts, preserving a leading text part", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "assistant",
          "llm.input_messages.0.message.content": "let me check",
          "llm.input_messages.0.message.tool_calls.0.tool_call.id": "call_1",
          "llm.input_messages.0.message.tool_calls.0.tool_call.function.name": "get_weather",
          "llm.input_messages.0.message.tool_calls.0.tool_call.function.arguments": '{"city":"NYC"}',
        },
        OI
      )
    ).toEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "let me check" },
          { type: "tool-call", toolCallId: "call_1", toolName: "get_weather", args: { city: "NYC" } },
        ],
      },
    ]);
  });

  it("joins multi-part `contents` text when scalar content is absent", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.contents.0.message_content.type": "text",
          "llm.input_messages.0.message.contents.0.message_content.text": "part one",
          "llm.input_messages.0.message.contents.1.message_content.type": "text",
          "llm.input_messages.0.message.contents.1.message_content.text": "part two",
        },
        OI
      )
    ).toEqual([{ role: "user", content: "part one\npart two" }]);
  });

  it("defaults a missing role to 'user' but keeps the content", () => {
    expect(
      parseIndexedMessages({ "gen_ai.prompt.0.content": "no role here" }, OLLM)
    ).toEqual([{ role: "user", content: "no role here" }]);
  });

  it("returns undefined when no indexed messages are present", () => {
    expect(parseIndexedMessages({ "gen_ai.request.model": "gpt-4o" }, OLLM)).toBeUndefined();
  });

  it("parses non-JSON tool arguments into a { raw } object rather than throwing", () => {
    const messages = parseIndexedMessages(
      {
        "gen_ai.completion.0.role": "assistant",
        "gen_ai.completion.0.tool_calls.0.id": "c1",
        "gen_ai.completion.0.tool_calls.0.name": "noop",
        "gen_ai.completion.0.tool_calls.0.arguments": "not json",
      },
      { ...OLLM, prefix: "gen_ai.completion" }
    );
    expect(messages).toEqual([
      {
        role: "assistant",
        content: [{ type: "tool-call", toolCallId: "c1", toolName: "noop", args: { raw: "not json" } }],
      },
    ]);
  });
});

describe("extractIndexedToolCalls", () => {
  it("flattens tool calls across all output messages into span-level ToolCall[]", () => {
    expect(
      extractIndexedToolCalls(
        {
          "gen_ai.completion.0.role": "assistant",
          "gen_ai.completion.0.tool_calls.0.id": "c1",
          "gen_ai.completion.0.tool_calls.0.name": "search",
          "gen_ai.completion.0.tool_calls.0.arguments": '{"q":"x"}',
          "gen_ai.completion.0.tool_calls.1.id": "c2",
          "gen_ai.completion.0.tool_calls.1.name": "lookup",
          "gen_ai.completion.0.tool_calls.1.arguments": '{"id":7}',
        },
        { ...OLLM, prefix: "gen_ai.completion" }
      )
    ).toEqual([
      { type: "tool-call", toolCallId: "c1", toolName: "search", args: { q: "x" } },
      { type: "tool-call", toolCallId: "c2", toolName: "lookup", args: { id: 7 } },
    ]);
  });

  it("returns undefined when there are no tool calls", () => {
    expect(
      extractIndexedToolCalls(
        { "gen_ai.completion.0.role": "assistant", "gen_ai.completion.0.content": "hi" },
        { ...OLLM, prefix: "gen_ai.completion" }
      )
    ).toBeUndefined();
  });

  it("returns undefined when the config declares no tool-call shape", () => {
    expect(
      extractIndexedToolCalls(
        { "gen_ai.prompt.0.tool_calls.0.name": "x" },
        { prefix: "gen_ai.prompt", messageInfix: "" }
      )
    ).toBeUndefined();
  });
});

describe("messagesToPlainText", () => {
  it("newline-joins text content and text parts, dropping tool-call parts", () => {
    expect(
      messagesToPlainText([
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "answer" },
            { type: "tool-call", toolCallId: "c", toolName: "t", args: {} },
          ],
        },
      ])
    ).toBe("hello\nanswer");
  });

  it("returns undefined when there is no text", () => {
    expect(messagesToPlainText(undefined)).toBeUndefined();
    expect(messagesToPlainText([])).toBeUndefined();
    expect(
      messagesToPlainText([
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c", toolName: "t", args: {} }] },
      ])
    ).toBeUndefined();
  });
});
