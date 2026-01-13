// Import setup first to mock @opentelemetry/api
import "./setup-traced";

import { describe, it, expect, beforeEach } from "vitest";
import { withTracing } from "../src/traced";

// Get mock spans from globalThis (set by setup file)
interface MockSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  status: { code: number; message?: string } | null;
  ended: boolean;
  traceId: string;
  spanId: string;
}

function getCreatedSpans(): MockSpan[] {
  return (globalThis as any).__mockOtelSpans || [];
}

function clearCreatedSpans(): void {
  (globalThis as any).__mockOtelSpans = [];
  // Reset ID counters to get consistent trace IDs in tests
  (globalThis as any).__resetMockOtelCounters?.();
}

// Helper types
type MockMessage =
  | { type: "assistant"; message: { content: Array<{ type: string; text?: string; name?: string; id?: string; input?: unknown }>; model?: string; usage?: { input_tokens: number; output_tokens: number } } }
  | { type: "result"; subtype: "success" | "error"; result?: string; usage?: { input_tokens: number; output_tokens: number }; total_cost_usd?: number; duration_ms?: number; session_id?: string };

// Helper to create mock query function
function createMockQuery(messages: MockMessage[]) {
  return async function* mockQuery(options: { prompt: string; options?: { model?: string; hooks?: Record<string, Array<{ hooks: Array<(input: unknown, toolUseId: string | null, opts: { signal: AbortSignal }) => Promise<{ continue: boolean }>> }>> } }) {
    const hooks = options.options?.hooks;

    for (const msg of messages) {
      // Simulate tool execution via hooks for tool_use blocks
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "tool_use" && block.id && hooks) {
            // Call PreToolUse hooks
            const preHooks = hooks.PreToolUse;
            if (preHooks) {
              for (const matcher of preHooks) {
                for (const hook of matcher.hooks) {
                  await hook(
                    { hook_event_name: "PreToolUse", session_id: "test", tool_name: block.name, tool_input: block.input },
                    block.id,
                    { signal: new AbortController().signal }
                  );
                }
              }
            }

            // Call PostToolUse hooks
            const postHooks = hooks.PostToolUse;
            if (postHooks) {
              for (const matcher of postHooks) {
                for (const hook of matcher.hooks) {
                  await hook(
                    { hook_event_name: "PostToolUse", session_id: "test", tool_name: block.name, tool_response: { result: "tool result" } },
                    block.id,
                    { signal: new AbortController().signal }
                  );
                }
              }
            }
          }
        }
      }
      yield msg;
    }
  };
}

describe("withTracing", () => {
  beforeEach(() => {
    clearCreatedSpans();
  });

  describe("pass-through behavior", () => {
    it("should yield all messages from query function", async () => {
      const messages: MockMessage[] = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }], usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const received: MockMessage[] = [];
      for await (const msg of withTracing(mockQuery, { query: { prompt: "test prompt" } })) {
        received.push(msg);
      }

      expect(received).toHaveLength(2);
      expect(received[0].type).toBe("assistant");
      expect(received[1].type).toBe("result");
    });

    it("should preserve message content unchanged", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Expected result", usage: { input_tokens: 50, output_tokens: 25 } },
      ];
      const mockQuery = createMockQuery(messages);

      const received: MockMessage[] = [];
      for await (const msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        received.push(msg);
      }

      expect(received[0]).toEqual(messages[0]);
    });
  });

  describe("agent span", () => {
    it("should create invoke_agent span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test prompt" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan).toBeDefined();
    });

    it("should include custom name in span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "my-agent" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.name).toBe("invoke_agent my-agent");
    });

    it("should set prompt as input attribute (JSON messages array)", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "my test prompt" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      // Input is now a JSON array of messages
      expect(agentSpan?.attributes["gen_ai.request.input"]).toBe('[{"role":"user","content":"my test prompt"}]');
    });

    it("should set model attribute when provided via telemetry", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test", options: { model: "claude-sonnet" } }, telemetry: { isEnabled: true, promptName: "test", model: "claude-sonnet" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.attributes["gen_ai.request.model"]).toBe("claude-sonnet");
    });
  });

  describe("chat spans", () => {
    it("should create chat span for assistant message", async () => {
      const messages: MockMessage[] = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }], model: "claude-3", usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const chatSpan = spans.find(s => s.name.startsWith("chat"));
      expect(chatSpan).toBeDefined();
      expect(chatSpan?.name).toBe("chat claude-3");
    });

    it("should set turn number on chat spans", async () => {
      const messages: MockMessage[] = [
        { type: "assistant", message: { content: [{ type: "text", text: "Turn 1" }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: "assistant", message: { content: [{ type: "text", text: "Turn 2" }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const chatSpans = spans.filter(s => s.name.startsWith("chat"));
      expect(chatSpans).toHaveLength(2);
      expect(chatSpans[0].attributes["gen_ai.turn.number"]).toBe(1);
      expect(chatSpans[1].attributes["gen_ai.turn.number"]).toBe(2);
    });

    it("should include text output in chat span", async () => {
      const messages: MockMessage[] = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello world" }], usage: { input_tokens: 1, output_tokens: 1 } } },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const chatSpan = spans.find(s => s.name.startsWith("chat"));
      expect(chatSpan?.attributes["gen_ai.response.output"]).toBe("Hello world");
    });

    it("should include tool_use in chat span output", async () => {
      const messages: MockMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Read", id: "t-1", input: { path: "/test" } }],
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const chatSpan = spans.find(s => s.name.startsWith("chat"));
      const output = chatSpan?.attributes["gen_ai.response.output"] as string;
      expect(output).toContain("[Tool: Read]");
      expect(output).toContain("/test");
    });
  });

  describe("tool spans", () => {
    it("should create tool span via PreToolUse hook", async () => {
      const messages: MockMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Search", id: "tool-123", input: { query: "test" } }],
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const toolSpan = spans.find(s => s.name.includes("execute_tool"));
      expect(toolSpan).toBeDefined();
      expect(toolSpan?.name).toBe("execute_tool Search");
    });

    it("should set tool attributes on tool span", async () => {
      const messages: MockMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Read", id: "tool-456", input: { file: "test.ts" } }],
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const toolSpan = spans.find(s => s.name.includes("execute_tool"));
      expect(toolSpan?.attributes["gen_ai.tool.name"]).toBe("Read");
      expect(toolSpan?.attributes["gen_ai.tool.call.id"]).toBe("tool-456");
      expect(toolSpan?.attributes["gen_ai.tool.input"]).toContain("test.ts");
    });

    it("should set tool output via PostToolUse hook", async () => {
      const messages: MockMessage[] = [
        {
          type: "assistant",
          message: {
            content: [{ type: "tool_use", name: "Read", id: "tool-789", input: {} }],
            usage: { input_tokens: 1, output_tokens: 1 }
          }
        },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const toolSpan = spans.find(s => s.name.includes("execute_tool"));
      const output = toolSpan?.attributes["gen_ai.tool.output"] as string;
      expect(output).toContain("tool result");
    });
  });

  describe("result handling", () => {
    it("should set result output on agent span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Final answer" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.attributes["gen_ai.response.output"]).toBe("Final answer");
    });

    it("should set usage on agent span from result", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done", usage: { input_tokens: 100, output_tokens: 50 } },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.attributes["gen_ai.usage.input_tokens"]).toBe(100);
      expect(agentSpan?.attributes["gen_ai.usage.output_tokens"]).toBe(50);
    });

    it("should set cost and duration on agent span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done", total_cost_usd: 0.005, duration_ms: 1234 },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.attributes["gen_ai.usage.cost_usd"]).toBe(0.005);
      expect(agentSpan?.attributes["gen_ai.duration_ms"]).toBe(1234);
    });

    it("should set session_id on agent span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done", session_id: "sess-abc" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.attributes["agentmark.session_id"]).toBe("sess-abc");
    });

    it("should set OK status on success", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.status?.code).toBe(1); // SpanStatusCode.OK
    });

    it("should set ERROR status on error result", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "error", result: "Failed" },
      ];
      const mockQuery = createMockQuery(messages);

      for await (const _msg of withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
        // consume
      }

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.status?.code).toBe(2); // SpanStatusCode.ERROR
    });
  });

  describe("error handling", () => {
    it("should set ERROR status on thrown error", async () => {
      const errorQuery = async function* (_options: { prompt: string }) {
        yield { type: "assistant" as const, message: { content: [{ type: "text", text: "Hi" }], usage: { input_tokens: 1, output_tokens: 1 } } };
        throw new Error("Query failed");
      };

      await expect(async () => {
        for await (const _msg of withTracing(errorQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
          // consume
        }
      }).rejects.toThrow("Query failed");

      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.status?.code).toBe(2); // ERROR
      expect(agentSpan?.ended).toBe(true);
    });

    it("should end all spans on error", async () => {
      const errorQuery = async function* (_options: { prompt: string }) {
        yield { type: "assistant" as const, message: { content: [{ type: "text", text: "Hi" }], usage: { input_tokens: 1, output_tokens: 1 } } };
        throw new Error("Boom");
      };

      try {
        for await (const _msg of withTracing(errorQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } })) {
          // consume
        }
      } catch {
        // expected
      }

      const spans = getCreatedSpans();
      // All spans should be ended
      expect(spans.every(s => s.ended)).toBe(true);
    });
  });

  describe("type inference", () => {
    it("should infer return type from query function", async () => {
      type CustomMessage = { type: "custom"; value: number };

      const customQuery = async function* (_options: { prompt: string }): AsyncGenerator<CustomMessage> {
        yield { type: "custom", value: 42 };
      };

      const results: CustomMessage[] = [];
      for await (const msg of withTracing(customQuery, { query: { prompt: "test" } })) {
        results.push(msg);
      }

      expect(results[0].type).toBe("custom");
      expect(results[0].value).toBe(42);
    });

    it("should accept query options matching function signature", async () => {
      type CustomOptionsPayload = { customField: string };

      const customQuery = async function* (options: { prompt: string; options?: CustomOptionsPayload }) {
        yield { received: options.options?.customField || "" };
      };

      const results: Array<{ received: string }> = [];
      for await (const msg of withTracing(customQuery, { query: { prompt: "test", options: { customField: "hello" } } })) {
        results.push(msg);
      }

      expect(results[0].received).toBe("hello");
    });
  });

  describe("TracedResult API", () => {
    it("should return TracedResult with traceId property", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const result = withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } });

      // traceId should be available immediately, before iteration
      expect(result.traceId).toBeDefined();
      expect(typeof result.traceId).toBe("string");
      expect(result.traceId.length).toBeGreaterThan(0);
    });

    it("should provide traceId before iteration starts", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const result = withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } });

      // Get trace ID first
      const traceId = result.traceId;
      expect(traceId).toBeDefined();

      // Then iterate
      const received: MockMessage[] = [];
      for await (const msg of result) {
        received.push(msg);
      }

      expect(received).toHaveLength(1);
    });

    it("should return traceId matching the agent span", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const result = withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } });
      const traceId = result.traceId;

      // Iterate to complete
      for await (const _msg of result) {
        // consume
      }

      // The trace ID should match the agent span's trace ID
      const spans = getCreatedSpans();
      const agentSpan = spans.find(s => s.name.includes("invoke_agent"));
      expect(agentSpan?.traceId).toBe(traceId);
    });

    it("should be directly iterable with for-await-of", async () => {
      const messages: MockMessage[] = [
        { type: "assistant", message: { content: [{ type: "text", text: "Hello" }], usage: { input_tokens: 10, output_tokens: 5 } } },
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const result = withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } });

      const received: MockMessage[] = [];
      for await (const msg of result) {
        received.push(msg);
      }

      expect(received).toHaveLength(2);
      expect(received[0].type).toBe("assistant");
      expect(received[1].type).toBe("result");
    });

    it("should have consistent traceId across multiple accesses", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];
      const mockQuery = createMockQuery(messages);

      const result = withTracing(mockQuery, { query: { prompt: "test" }, telemetry: { isEnabled: true, promptName: "test" } });

      // Access traceId multiple times
      const id1 = result.traceId;
      const id2 = result.traceId;
      const id3 = result.traceId;

      expect(id1).toBe(id2);
      expect(id2).toBe(id3);
    });

    it("should generate unique traceId for each traced call", async () => {
      const messages: MockMessage[] = [
        { type: "result", subtype: "success", result: "Done" },
      ];

      const result1 = withTracing(createMockQuery(messages), { prompt: "test1" });
      const result2 = withTracing(createMockQuery(messages), { prompt: "test2" });

      expect(result1.traceId).not.toBe(result2.traceId);
    });
  });
});
