import { describe, it, expect } from "vitest";
import {
  IndexedMessageConfig,
  parseIndexedMessages,
  extractIndexedToolCalls,
  messagesToPlainText,
} from "../../src/normalizer/extractors/indexed-message-parser";

// Minimal configs exercising both shapes.
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
const OLLM: IndexedMessageConfig = {
  prefix: "gen_ai.prompt",
  messageInfix: "",
  toolCalls: { arrayKey: "tool_calls", infix: "", idKey: "id", nameKey: "name", argsKey: "arguments" },
};
const NO_TOOLS: IndexedMessageConfig = { prefix: "gen_ai.prompt", messageInfix: "" };

describe("collectIndices behavior (via parseIndexedMessages)", () => {
  it("ignores attribute keys that do not start with the prefix", () => {
    expect(
      parseIndexedMessages(
        {
          "unrelated.key": "x",
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.content": "hi",
        },
        OI
      )
    ).toStrictEqual([{ role: "user", content: "hi" }]);
  });

  it("ignores prefix keys that are not followed by an integer index", () => {
    // `llm.input_messages.foo` matches the prefix but has no numeric index.
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.foo": "noise",
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.content": "hi",
        },
        OI
      )
    ).toStrictEqual([{ role: "user", content: "hi" }]);
  });

  it("returns undefined when no indexed keys are present at all", () => {
    expect(parseIndexedMessages({ "gen_ai.request.model": "m" }, OLLM)).toBeUndefined();
  });
});

describe("parseIndexedMessages content coercion", () => {
  it("uses a string scalar content verbatim", () => {
    expect(parseIndexedMessages({ "gen_ai.prompt.0.role": "user", "gen_ai.prompt.0.content": "hi" }, OLLM)).toStrictEqual([
      { role: "user", content: "hi" },
    ]);
  });

  it("stringifies a non-string scalar content", () => {
    expect(parseIndexedMessages({ "gen_ai.prompt.0.role": "user", "gen_ai.prompt.0.content": 42 }, OLLM)).toStrictEqual([
      { role: "user", content: "42" },
    ]);
  });

  it("falls back to multi-part contents text only when scalar content is absent", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.contents.0.message_content.text": "a",
          "llm.input_messages.0.message.contents.1.message_content.text": "b",
        },
        OI
      )
    ).toStrictEqual([{ role: "user", content: "a\nb" }]);
  });

  it("ignores contents entirely when the config declares no contentsKey", () => {
    // OLLM has no contentsKey, so a contents.* attribute must not contribute.
    expect(
      parseIndexedMessages(
        { "gen_ai.prompt.0.role": "user", "gen_ai.prompt.0.contents.0.message_content.text": "ignored" },
        OLLM
      )
    ).toStrictEqual([{ role: "user", content: "" }]);
  });

  it("skips empty and non-string contents parts when joining", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.contents.0.message_content.text": "",
          "llm.input_messages.0.message.contents.1.message_content.text": 99,
          "llm.input_messages.0.message.contents.2.message_content.text": "kept",
        },
        OI
      )
    ).toStrictEqual([{ role: "user", content: "kept" }]);
  });

  it("returns content '' for a role-only message with no content or tools", () => {
    expect(parseIndexedMessages({ "gen_ai.prompt.0.role": "assistant" }, OLLM)).toStrictEqual([
      { role: "assistant", content: "" },
    ]);
  });

  it("defaults role to 'user' when the role attribute is missing", () => {
    expect(parseIndexedMessages({ "gen_ai.prompt.0.content": "x" }, OLLM)).toStrictEqual([{ role: "user", content: "x" }]);
  });
});

describe("parseIndexedMessages empty-position handling", () => {
  it("skips a wholly empty index sitting between two real messages", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.0.role": "user",
          "gen_ai.prompt.0.content": "first",
          // index 1: a stray unrelated key produces the index but no fields
          "gen_ai.prompt.1.": "",
          "gen_ai.prompt.2.role": "assistant",
          "gen_ai.prompt.2.content": "third",
        },
        OLLM
      )
    ).toStrictEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "third" },
    ]);
  });
});

describe("parseIndexedMessages tool-call content parts", () => {
  it("emits text + tool-call parts when both are present", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.0.role": "assistant",
          "gen_ai.prompt.0.content": "thinking",
          "gen_ai.prompt.0.tool_calls.0.id": "c1",
          "gen_ai.prompt.0.tool_calls.0.name": "do",
          "gen_ai.prompt.0.tool_calls.0.arguments": '{"a":1}',
        },
        OLLM
      )
    ).toStrictEqual([
      {
        role: "assistant",
        content: [
          { type: "text", text: "thinking" },
          { type: "tool-call", toolCallId: "c1", toolName: "do", args: { a: 1 } },
        ],
      },
    ]);
  });

  it("emits only tool-call parts when there is no text", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.0.role": "assistant",
          "gen_ai.prompt.0.tool_calls.0.name": "do",
        },
        OLLM
      )
    ).toStrictEqual([
      { role: "assistant", content: [{ type: "tool-call", toolCallId: "", toolName: "do", args: {} }] },
    ]);
  });

  it("skips a tool-call entry that has no name", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.0.role": "assistant",
          "gen_ai.prompt.0.content": "text only",
          "gen_ai.prompt.0.tool_calls.0.id": "orphan-without-name",
        },
        OLLM
      )
    ).toStrictEqual([{ role: "assistant", content: "text only" }]);
  });

  it("ignores tool_calls attributes entirely when the config has no toolCalls shape", () => {
    expect(
      parseIndexedMessages(
        { "gen_ai.prompt.0.role": "assistant", "gen_ai.prompt.0.tool_calls.0.name": "x" },
        NO_TOOLS
      )
    ).toStrictEqual([{ role: "assistant", content: "" }]);
  });
});

describe("parseArgs (via tool-call args)", () => {
  const toolMsg = (argsAttr: any) =>
    parseIndexedMessages(
      {
        "gen_ai.prompt.0.role": "assistant",
        "gen_ai.prompt.0.tool_calls.0.name": "t",
        "gen_ai.prompt.0.tool_calls.0.arguments": argsAttr,
      },
      OLLM
    );
  const argsOf = (msgs: any) => (msgs![0].content as any[])[0].args;

  it("parses a valid JSON object string into an object", () => {
    expect(argsOf(toolMsg('{"k":"v"}'))).toStrictEqual({ k: "v" });
  });
  it("wraps a non-JSON string as { raw }", () => {
    expect(argsOf(toolMsg("not json"))).toStrictEqual({ raw: "not json" });
  });
  it("wraps a JSON scalar (non-object) as { raw }", () => {
    expect(argsOf(toolMsg("5"))).toStrictEqual({ raw: "5" });
  });
  it("passes an object-typed args attribute through unchanged", () => {
    expect(argsOf(toolMsg({ already: "object" }))).toStrictEqual({ already: "object" });
  });
  it("defaults a missing args attribute to {}", () => {
    const msgs = parseIndexedMessages(
      { "gen_ai.prompt.0.role": "assistant", "gen_ai.prompt.0.tool_calls.0.name": "t" },
      OLLM
    );
    expect(argsOf(msgs)).toStrictEqual({});
  });
});

describe("extractIndexedToolCalls", () => {
  it("returns undefined when the config declares no tool-call shape", () => {
    expect(extractIndexedToolCalls({ "gen_ai.prompt.0.tool_calls.0.name": "x" }, NO_TOOLS)).toBeUndefined();
  });
  it("returns undefined when there are no tool calls", () => {
    expect(extractIndexedToolCalls({ "gen_ai.prompt.0.role": "user" }, OLLM)).toBeUndefined();
  });
  it("collects calls across multiple messages in order", () => {
    expect(
      extractIndexedToolCalls(
        {
          "gen_ai.prompt.0.tool_calls.0.id": "a",
          "gen_ai.prompt.0.tool_calls.0.name": "first",
          "gen_ai.prompt.1.tool_calls.0.id": "b",
          "gen_ai.prompt.1.tool_calls.0.name": "second",
        },
        OLLM
      )
    ).toStrictEqual([
      { type: "tool-call", toolCallId: "a", toolName: "first", args: {} },
      { type: "tool-call", toolCallId: "b", toolName: "second", args: {} },
    ]);
  });
});

describe("messagesToPlainText", () => {
  it("returns undefined for undefined and empty arrays", () => {
    expect(messagesToPlainText(undefined)).toBeUndefined();
    expect(messagesToPlainText([])).toBeUndefined();
  });
  it("keeps non-empty string content and skips empty string content", () => {
    expect(
      messagesToPlainText([
        { role: "user", content: "a" },
        { role: "user", content: "" },
        { role: "user", content: "b" },
      ])
    ).toBe("a\nb");
  });
  it("keeps text parts, skips empty text parts and tool-call parts in arrays", () => {
    expect(
      messagesToPlainText([
        {
          role: "assistant",
          content: [
            { type: "text", text: "" },
            { type: "tool-call", toolCallId: "c", toolName: "t", args: {} },
            { type: "text", text: "kept" },
          ],
        },
      ])
    ).toBe("kept");
  });
  it("keeps non-empty raw string parts and skips empty ones inside content arrays", () => {
    expect(
      messagesToPlainText([{ role: "user", content: ["", "raw-part"] as any }])
    ).toBe("raw-part");
  });
  it("returns undefined when only tool-call parts exist", () => {
    expect(
      messagesToPlainText([
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "c", toolName: "t", args: {} }] },
      ])
    ).toBeUndefined();
  });
});

describe("collectIndices sort (via parseIndexedMessages ordering)", () => {
  it("sorts three out-of-order indices ascending (kills comparator mutations)", () => {
    expect(
      parseIndexedMessages(
        {
          "gen_ai.prompt.2.role": "user",
          "gen_ai.prompt.2.content": "c2",
          "gen_ai.prompt.0.role": "user",
          "gen_ai.prompt.0.content": "c0",
          "gen_ai.prompt.1.role": "user",
          "gen_ai.prompt.1.content": "c1",
        },
        OLLM
      )
    ).toStrictEqual([
      { role: "user", content: "c0" },
      { role: "user", content: "c1" },
      { role: "user", content: "c2" },
    ]);
  });
});

describe("readContentsText edges", () => {
  it("yields content '' when contentsKey is configured but no contents indices exist", () => {
    expect(
      parseIndexedMessages({ "llm.input_messages.0.message.role": "user" }, OI)
    ).toStrictEqual([{ role: "user", content: "" }]);
  });

  it("yields content '' when every contents part is empty/non-text", () => {
    expect(
      parseIndexedMessages(
        {
          "llm.input_messages.0.message.role": "user",
          "llm.input_messages.0.message.contents.0.message_content.text": "",
        },
        OI
      )
    ).toStrictEqual([{ role: "user", content: "" }]);
  });
});

describe("parseArgs final fallback", () => {
  it("wraps a non-string, non-object args value (number) as { raw }", () => {
    const msgs = parseIndexedMessages(
      {
        "gen_ai.prompt.0.role": "assistant",
        "gen_ai.prompt.0.tool_calls.0.name": "t",
        "gen_ai.prompt.0.tool_calls.0.arguments": 7,
      },
      OLLM
    );
    expect((msgs![0].content as any[])[0].args).toStrictEqual({ raw: 7 });
  });

  it("returns {} for an explicitly null args value (kills the null-guard operand)", () => {
    const msgs = parseIndexedMessages(
      {
        "gen_ai.prompt.0.role": "assistant",
        "gen_ai.prompt.0.tool_calls.0.name": "t",
        "gen_ai.prompt.0.tool_calls.0.arguments": null,
      },
      OLLM
    );
    expect((msgs![0].content as any[])[0].args).toStrictEqual({});
  });
});

describe("parseIndexedMessages returns undefined when every index is wholly empty", () => {
  it("yields undefined (not []) when an index exists but carries no usable fields", () => {
    // The key produces index 0, but the tool call has no name and there is no
    // role/content, so the only message is skipped → messages is empty.
    expect(
      parseIndexedMessages({ "gen_ai.prompt.0.tool_calls.0.id": "orphan" }, OLLM)
    ).toBeUndefined();
  });
});
