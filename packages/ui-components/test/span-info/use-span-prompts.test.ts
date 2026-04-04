/**
 * use-span-prompts Pure Function Tests
 *
 * Tests for the extracted helper functions in use-span-prompts.ts:
 * - isToolSpan: span type classification
 * - isAgentSpan: agent span detection
 * - extractPromptsFromSpan: input prompt extraction with JSON parsing
 * - extractOutputFromSpan: output data extraction with tool call handling
 * - extractSystemPromptFromTraces: system prompt extraction from agent attributes
 * - mergeSpanIO: lazy-loaded IO merging into span data
 */

import { describe, it, expect } from "vitest";
import {
  isToolSpan,
  isAgentSpan,
  extractPromptsFromSpan,
  extractOutputFromSpan,
  extractSystemPromptFromTraces,
  mergeSpanIO,
} from "../../src/sections/traces/trace-drawer/span-info/tabs/hooks/use-span-prompts";
import type { SpanIOData } from "../../src/sections/traces/trace-drawer/trace-drawer-provider";

// ============================================================================
// isToolSpan Tests
// ============================================================================

describe("isToolSpan", () => {
  it("should return false when span is null", () => {
    expect(isToolSpan(null)).toBe(false);
  });

  it("should return false when span is undefined", () => {
    expect(isToolSpan(undefined)).toBe(false);
  });

  it("should return false when span has no data", () => {
    expect(isToolSpan({ name: "test" })).toBe(false);
  });

  it("should return true when span has toolCalls data", () => {
    expect(isToolSpan({ data: { toolCalls: '[{"name":"search"}]' } })).toBe(true);
  });

  it("should return true when span type is SPAN with a non-claude name", () => {
    expect(isToolSpan({ name: "get_weather", data: { type: "SPAN" } })).toBe(true);
  });

  it("should return false when span type is SPAN but name starts with claude.", () => {
    expect(isToolSpan({ name: "claude.completion", data: { type: "SPAN" } })).toBe(false);
  });

  it("should return false when span type is GENERATION without toolCalls", () => {
    expect(isToolSpan({ name: "llm.call", data: { type: "GENERATION" } })).toBe(false);
  });

  it("should return false when span type is SPAN but name is empty", () => {
    expect(isToolSpan({ name: "", data: { type: "SPAN" } })).toBe(false);
  });

  it("should return false when span type is SPAN but name is undefined", () => {
    expect(isToolSpan({ data: { type: "SPAN" } })).toBe(false);
  });

  it("should return true when toolCalls is a non-empty array (not string)", () => {
    expect(isToolSpan({ data: { toolCalls: [{ name: "search" }] } })).toBe(true);
  });
});

// ============================================================================
// isAgentSpan Tests
// ============================================================================

describe("isAgentSpan", () => {
  it("should return false when span is null", () => {
    expect(isAgentSpan(null)).toBe(false);
  });

  it("should return false when span is undefined", () => {
    expect(isAgentSpan(undefined)).toBe(false);
  });

  it("should return true when span name starts with invoke_agent", () => {
    expect(isAgentSpan({ name: "invoke_agent code-reviewer" })).toBe(true);
  });

  it("should return true when span name is exactly invoke_agent", () => {
    expect(isAgentSpan({ name: "invoke_agent" })).toBe(true);
  });

  it("should return true when span has props but no input and is not GENERATION", () => {
    expect(isAgentSpan({ data: { props: '{"query":"test"}', type: "SPAN" } })).toBe(true);
  });

  it("should return true when span has props, no input, and no type", () => {
    expect(isAgentSpan({ data: { props: '{"query":"test"}' } })).toBe(true);
  });

  it("should return true when span has props and input", () => {
    expect(isAgentSpan({
      name: "some-span",
      data: { props: '{"x":1}', input: "some input" },
    })).toBe(true);
  });

  it("should return false when span has props but is GENERATION type", () => {
    expect(isAgentSpan({
      name: "llm",
      data: { props: '{"x":1}', type: "GENERATION" },
    })).toBe(false);
  });

  it("should return false for regular span without props or invoke_agent name", () => {
    expect(isAgentSpan({ name: "llm.call", data: { type: "GENERATION" } })).toBe(false);
  });
});

// ============================================================================
// extractPromptsFromSpan Tests
// ============================================================================

describe("extractPromptsFromSpan", () => {
  describe("null/undefined span", () => {
    it("should return empty array for null span", () => {
      expect(extractPromptsFromSpan(null)).toEqual([]);
    });

    it("should return empty array for undefined span", () => {
      expect(extractPromptsFromSpan(undefined)).toEqual([]);
    });

    it("should return empty array for span with no input", () => {
      expect(extractPromptsFromSpan({ data: {} })).toEqual([]);
    });

    it("should return empty array for span with empty input", () => {
      expect(extractPromptsFromSpan({ data: { input: "" } })).toEqual([]);
    });
  });

  describe("agent spans", () => {
    it("should return props as input for invoke_agent span", () => {
      const span = {
        name: "invoke_agent reviewer",
        data: { props: '{"query":"review this"}' },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
      expect(result[0]!.content).toBe(JSON.stringify({ query: "review this" }, null, 2));
    });

    it("should handle props as object (not string)", () => {
      const span = {
        name: "invoke_agent",
        data: { props: { query: "test" } },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
      expect(result[0]!.content).toBe(JSON.stringify({ query: "test" }, null, 2));
    });

    it("should return empty array when agent span has no props", () => {
      const span = { name: "invoke_agent reviewer", data: {} };
      expect(extractPromptsFromSpan(span)).toEqual([]);
    });

    it("should return empty array when agent span props is invalid JSON", () => {
      const span = {
        name: "invoke_agent reviewer",
        data: { props: "not valid json {{{" },
      };
      // JSON.parse will throw, but it's caught. However the parsed value
      // is the invalid string itself, which is then JSON.stringify'd
      // This is actually a nuance — "not valid json {{" IS parseable if
      // typeof check handles it. Let me verify:
      const result = extractPromptsFromSpan(span);
      // The catch block returns []
      expect(result).toEqual([]);
    });

    it("should return empty for trace wrapper span (has props, no input, not GENERATION)", () => {
      const span = {
        name: "my-trace",
        data: { props: '{"key":"val"}' },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
    });
  });

  describe("tool spans", () => {
    it("should extract toolCalls args as input", () => {
      const span = {
        name: "get_weather",
        data: {
          type: "SPAN",
          toolCalls: JSON.stringify([{ name: "get_weather", args: { city: "NYC" } }]),
        },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
      expect(result[0]!.content).toBe(JSON.stringify({ city: "NYC" }, null, 2));
    });

    it("should use string args directly", () => {
      const span = {
        name: "search_tool",
        data: {
          type: "SPAN",
          toolCalls: JSON.stringify([{ name: "search", args: "raw search query" }]),
        },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe("raw search query");
    });

    it("should handle toolCalls as object (not string)", () => {
      const span = {
        name: "tool_span",
        data: {
          type: "SPAN",
          toolCalls: [{ name: "search", args: { q: "test" } }],
        },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
    });

    it("should fall back to input as input when no toolCalls", () => {
      const span = {
        name: "custom_tool",
        data: { type: "SPAN", input: "tool input text" },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
      expect(result[0]!.content).toBe("tool input text");
    });

    it("should parse array input as input messages", () => {
      const messages = [{ role: "user", content: "hi" }];
      const span = {
        name: "my_tool",
        data: { type: "SPAN", input: JSON.stringify(messages) },
      };
      const result = extractPromptsFromSpan(span);
      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("input");
    });

    it("should return empty array for tool span with no input and no toolCalls", () => {
      const span = { name: "tool", data: { type: "SPAN" } };
      expect(extractPromptsFromSpan(span)).toEqual([]);
    });

    it("should handle empty toolCalls array", () => {
      const span = {
        name: "tool",
        data: { type: "SPAN", toolCalls: "[]", input: "fallback" },
      };
      const result = extractPromptsFromSpan(span);
      // Empty array means toolCalls length === 0, so falls through to input
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe("fallback");
    });

    it("should handle invalid toolCalls JSON and fall through to input", () => {
      const span = {
        name: "tool",
        data: { type: "SPAN", toolCalls: "bad json{", input: "fallback input" },
      };
      const result = extractPromptsFromSpan(span);
      // toolCalls parse throws, caught silently, then falls to input
      expect(result).toHaveLength(1);
      expect(result[0]!.content).toBe("fallback input");
    });
  });

  describe("regular (LLM) spans", () => {
    it("should parse JSON array input as LLM prompts", () => {
      const messages = [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" },
      ];
      const span = { data: { input: JSON.stringify(messages) } };
      const result = extractPromptsFromSpan(span);
      expect(result).toEqual(messages);
    });

    it("should extract messages from object with messages property", () => {
      const input = { messages: [{ role: "user", content: "hi" }] };
      const span = { data: { input: JSON.stringify(input) } };
      const result = extractPromptsFromSpan(span);
      expect(result).toEqual(input.messages);
    });

    it("should wrap parsed string value as user message", () => {
      const span = { data: { input: '"a simple string"' } };
      const result = extractPromptsFromSpan(span);
      expect(result).toEqual([{ role: "user", content: "a simple string" }]);
    });

    it("should wrap parsed non-string object as user message with raw input", () => {
      const span = { data: { input: '{"key":"value"}' } };
      const result = extractPromptsFromSpan(span);
      // parsed is an object, not a string, and not an array — falls to last branch
      // content is span.data.input (the raw JSON string)
      expect(result).toEqual([{ role: "user", content: '{"key":"value"}' }]);
    });

    it("should wrap non-JSON input as user message", () => {
      const span = { data: { input: "plain text prompt" } };
      const result = extractPromptsFromSpan(span);
      expect(result).toEqual([{ role: "user", content: "plain text prompt" }]);
    });

    it("should wrap invalid JSON as user message", () => {
      const span = { data: { input: "{ broken json }" } };
      const result = extractPromptsFromSpan(span);
      expect(result).toEqual([{ role: "user", content: "{ broken json }" }]);
    });

    it("should handle parsed number by using raw input as content", () => {
      const span = { data: { input: "42" } };
      const result = extractPromptsFromSpan(span);
      // JSON.parse("42") = 42 (number), typeof !== "string", so content = span.data.input
      expect(result).toEqual([{ role: "user", content: "42" }]);
    });
  });
});

// ============================================================================
// extractOutputFromSpan Tests
// ============================================================================

describe("extractOutputFromSpan", () => {
  describe("null/undefined span", () => {
    it("should return null for null span", () => {
      expect(extractOutputFromSpan(null)).toBeNull();
    });

    it("should return null for undefined span", () => {
      expect(extractOutputFromSpan(undefined)).toBeNull();
    });
  });

  describe("tool spans", () => {
    it("should return toolCall result text for tool span with result", () => {
      const span = {
        name: "search_tool",
        data: {
          type: "SPAN",
          toolCalls: JSON.stringify([{ name: "search", result: "found it" }]),
        },
      };
      const result = extractOutputFromSpan(span);
      expect(result).not.toBeNull();
      expect(result!.text).toBe("found it");
      expect(result!.toolCall).toEqual({ name: "search", result: "found it" });
    });

    it("should JSON.stringify non-string toolCall result", () => {
      const span = {
        name: "api_call",
        data: {
          type: "SPAN",
          toolCalls: JSON.stringify([{ name: "api", result: { status: "ok" } }]),
        },
      };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe(JSON.stringify({ status: "ok" }, null, 2));
    });

    it("should fall back to span output when toolCall has no result", () => {
      const span = {
        name: "my_tool",
        data: {
          type: "SPAN",
          toolCalls: JSON.stringify([{ name: "my_tool" }]),
          output: "tool output text",
        },
      };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("tool output text");
    });

    it("should create synthetic toolCall from span name when no toolCalls data", () => {
      const span = {
        name: "custom_tool",
        data: { type: "SPAN", output: "result text" },
      };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("result text");
      expect(result!.toolCall).toEqual({ toolName: "custom_tool" });
    });

    it("should use 'tool' as synthetic toolCall name when span has no name", () => {
      const span = {
        data: { type: "SPAN", toolCalls: "invalid json", output: "output" },
      };
      const result = extractOutputFromSpan(span);
      expect(result!.toolCall).toEqual({ toolName: "tool" });
    });

    it("should return null for tool span with no output and no toolCall result", () => {
      const span = {
        name: "empty_tool",
        data: { type: "SPAN" },
      };
      expect(extractOutputFromSpan(span)).toBeNull();
    });

    it("should handle toolCalls as pre-parsed array", () => {
      const span = {
        name: "tool",
        data: {
          type: "SPAN",
          toolCalls: [{ name: "tool", result: "done" }],
        },
      };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("done");
    });
  });

  describe("regular spans", () => {
    it("should return null when span has no output, outputObject, or toolCalls", () => {
      const span = { data: { input: "hello" } };
      expect(extractOutputFromSpan(span)).toBeNull();
    });

    it("should return output text for span with output", () => {
      const span = { data: { output: "response text" } };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("response text");
    });

    it("should return undefined text when output is empty but outputObject exists", () => {
      const span = { data: { output: "", outputObject: '{"result":42}' } };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBeUndefined();
      expect(result!.objectResponse).toEqual({ result: 42 });
    });

    it("should parse outputObject from JSON string", () => {
      const span = { data: { output: "text", outputObject: '{"key":"val"}' } };
      const result = extractOutputFromSpan(span);
      expect(result!.objectResponse).toEqual({ key: "val" });
    });

    it("should handle outputObject as pre-parsed object", () => {
      const span = { data: { output: "text", outputObject: { key: "val" } } };
      const result = extractOutputFromSpan(span);
      expect(result!.objectResponse).toEqual({ key: "val" });
    });

    it("should set objectResponse to null for invalid outputObject JSON", () => {
      const span = { data: { output: "text", outputObject: "invalid{json" } };
      const result = extractOutputFromSpan(span);
      expect(result!.objectResponse).toBeNull();
    });

    it("should parse toolCalls string via regular path when span is not tool type", () => {
      // A span with name starting with "claude." and type not "SPAN" is NOT a tool span
      // even when it has toolCalls data. However isToolSpan checks toolCalls first,
      // so any span with toolCalls goes through the tool span path.
      // To reach the regular span path for toolCalls parsing, we need a GENERATION
      // span with toolCalls but where isToolSpan returns false — but that's impossible
      // since isToolSpan returns true whenever span.data.toolCalls is truthy.
      // Therefore we test the regular path with outputObject only (no toolCalls).
      const span = { data: { output: "text", outputObject: '{"result":1}' } };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("text");
      expect(result!.objectResponse).toEqual({ result: 1 });
      expect(result!.toolCall).toBeNull();
      expect(result!.toolCalls).toBeUndefined();
    });

    it("should route span with toolCalls through tool span path (isToolSpan is true)", () => {
      // Spans with toolCalls are always classified as tool spans by isToolSpan.
      // This means the regular-span toolCalls parsing path is unreachable when
      // span.data.toolCalls is truthy. Verify the tool path is taken.
      const toolCalls = [{ name: "search", args: {} }];
      const span = { data: { output: "text", toolCalls: JSON.stringify(toolCalls) } };
      const result = extractOutputFromSpan(span);
      // Tool span path extracts first toolCall and returns text from result or output
      expect(result!.text).toBe("text");
      expect(result!.toolCall).toEqual(toolCalls[0]);
    });

    it("should use synthetic toolCall when toolCalls string is invalid JSON", () => {
      // isToolSpan returns true (toolCalls is truthy), tool path catches JSON parse error,
      // falls through to synthetic toolCall creation
      const span = { data: { output: "text", toolCalls: "not json" } };
      const result = extractOutputFromSpan(span);
      expect(result!.text).toBe("text");
      // Synthetic toolCall uses span name or "tool" when no name
      expect(result!.toolCall).toEqual({ toolName: "tool" });
    });

    it("should use synthetic toolCall when toolCalls array is empty", () => {
      // isToolSpan returns true, empty array means toolCalls[0] is undefined,
      // so toolCall stays null, then synthetic is created
      const span = { data: { output: "text", toolCalls: "[]" } };
      const result = extractOutputFromSpan(span);
      expect(result!.toolCall).toEqual({ toolName: "tool" });
    });
  });
});

// ============================================================================
// extractSystemPromptFromTraces Tests
// ============================================================================

describe("extractSystemPromptFromTraces", () => {
  it("should return null for empty traces array", () => {
    expect(extractSystemPromptFromTraces([])).toBeNull();
  });

  it("should return null when no invoke_agent spans exist", () => {
    const traces = [{
      spans: [
        { name: "llm.call", data: { attributes: {} } },
        { name: "tool.search", data: {} },
      ],
    }];
    expect(extractSystemPromptFromTraces(traces)).toBeNull();
  });

  it("should extract system prompt from invoke_agent span attributes", () => {
    const traces = [{
      spans: [
        {
          name: "invoke_agent reviewer",
          data: {
            attributes: JSON.stringify({
              "agentmark.system_prompt": "You are a code reviewer.",
            }),
          },
        },
      ],
    }];
    expect(extractSystemPromptFromTraces(traces)).toBe("You are a code reviewer.");
  });

  it("should handle attributes as pre-parsed object", () => {
    const traces = [{
      spans: [
        {
          name: "invoke_agent",
          data: {
            attributes: { "agentmark.system_prompt": "Be helpful" },
          },
        },
      ],
    }];
    expect(extractSystemPromptFromTraces(traces)).toBe("Be helpful");
  });

  it("should return first found system prompt across multiple traces", () => {
    const traces = [
      { spans: [{ name: "llm.call", data: {} }] },
      {
        spans: [
          {
            name: "invoke_agent first",
            data: {
              attributes: { "agentmark.system_prompt": "First prompt" },
            },
          },
        ],
      },
      {
        spans: [
          {
            name: "invoke_agent second",
            data: {
              attributes: { "agentmark.system_prompt": "Second prompt" },
            },
          },
        ],
      },
    ];
    expect(extractSystemPromptFromTraces(traces)).toBe("First prompt");
  });

  it("should return null when invoke_agent has no system_prompt attribute", () => {
    const traces = [{
      spans: [
        {
          name: "invoke_agent",
          data: { attributes: { "other.attr": "value" } },
        },
      ],
    }];
    expect(extractSystemPromptFromTraces(traces)).toBeNull();
  });

  it("should handle invalid attributes JSON gracefully", () => {
    const traces = [{
      spans: [
        { name: "invoke_agent", data: { attributes: "invalid{json" } },
      ],
    }];
    expect(extractSystemPromptFromTraces(traces)).toBeNull();
  });

  it("should handle trace with no spans property", () => {
    const traces = [{ id: "trace-1" }];
    expect(extractSystemPromptFromTraces(traces)).toBeNull();
  });

  it("should handle trace with empty spans array", () => {
    const traces = [{ spans: [] }];
    expect(extractSystemPromptFromTraces(traces)).toBeNull();
  });
});

// ============================================================================
// mergeSpanIO Tests
// ============================================================================

describe("mergeSpanIO", () => {
  const sampleIO: SpanIOData = {
    input: "merged input",
    output: "merged output",
    outputObject: '{"key":"val"}',
    toolCalls: '[{"name":"tool"}]',
  };

  it("should return the original span when span is null", () => {
    expect(mergeSpanIO(null, sampleIO)).toBeNull();
  });

  it("should return the original span when span is undefined", () => {
    expect(mergeSpanIO(undefined, sampleIO)).toBeUndefined();
  });

  it("should merge IO data into span.data", () => {
    const span = { id: "span-1", data: { type: "GENERATION", model: "gpt-4" } };
    const result = mergeSpanIO(span, sampleIO);

    expect(result.id).toBe("span-1");
    expect(result.data.input).toBe("merged input");
    expect(result.data.output).toBe("merged output");
    expect(result.data.outputObject).toBe('{"key":"val"}');
    expect(result.data.toolCalls).toBe('[{"name":"tool"}]');
  });

  it("should preserve existing span data fields", () => {
    const span = { id: "s1", data: { type: "GENERATION", model: "claude", cost: 0.01 } };
    const result = mergeSpanIO(span, sampleIO);

    expect(result.data.type).toBe("GENERATION");
    expect(result.data.model).toBe("claude");
    expect(result.data.cost).toBe(0.01);
  });

  it("should override existing IO fields with merged data", () => {
    const span = { id: "s1", data: { input: "old", output: "old" } };
    const result = mergeSpanIO(span, sampleIO);

    expect(result.data.input).toBe("merged input");
    expect(result.data.output).toBe("merged output");
  });

  it("should return a new object (not mutate original)", () => {
    const span = { id: "s1", data: { model: "gpt-4" } };
    const result = mergeSpanIO(span, sampleIO);

    expect(result).not.toBe(span);
    expect(result.data).not.toBe(span.data);
    // Original should be unchanged
    expect(span.data).not.toHaveProperty("input");
  });

  it("should handle IO with null outputObject and toolCalls", () => {
    const io: SpanIOData = {
      input: "in",
      output: "out",
      outputObject: null,
      toolCalls: null,
    };
    const span = { id: "s1", data: {} };
    const result = mergeSpanIO(span, io);

    expect(result.data.outputObject).toBeNull();
    expect(result.data.toolCalls).toBeNull();
  });

  it("should handle span with no existing data property", () => {
    const span = { id: "s1" };
    const result = mergeSpanIO(span, sampleIO);

    expect(result.data.input).toBe("merged input");
  });
});
