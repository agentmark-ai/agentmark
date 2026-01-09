import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOtelHooks,
  combineWithOtelHooks,
  createTelemetryContext,
  GenAIAttributes,
  AgentMarkAttributes,
  SpanNames,
} from "../src/hooks/otel-hooks";
import type { HooksConfig } from "../src/hooks/telemetry-hooks";
import type { OtelHooksConfig } from "../src/types";

/**
 * Mock span implementation that captures all operations for testing
 */
interface MockSpanData {
  name: string;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number; message?: string };
  exceptions: Error[];
  ended: boolean;
}

function createMockSpan(name: string, attributes?: Record<string, string | number | boolean>): MockSpanData & {
  setAttribute: (key: string, value: string | number | boolean) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  recordException: (error: Error) => void;
  end: () => void;
  spanContext: () => { traceId: string; spanId: string };
} {
  const data: MockSpanData = {
    name,
    attributes: { ...attributes },
    status: undefined,
    exceptions: [],
    ended: false,
  };

  return {
    ...data,
    setAttribute: (key: string, value: string | number | boolean) => {
      data.attributes[key] = value;
    },
    setStatus: (status: { code: number; message?: string }) => {
      data.status = status;
    },
    recordException: (error: Error) => {
      data.exceptions.push(error);
    },
    end: () => {
      data.ended = true;
    },
    spanContext: () => ({
      traceId: "mock-trace-id",
      spanId: "mock-span-id",
    }),
    // Expose data for assertions
    get attributes() { return data.attributes; },
    get status() { return data.status; },
    get exceptions() { return data.exceptions; },
    get ended() { return data.ended; },
  };
}

/**
 * Mock tracer that captures all created spans
 */
function createMockTracer() {
  const spans: ReturnType<typeof createMockSpan>[] = [];

  return {
    spans,
    startSpan: vi.fn((name: string, options?: { attributes?: Record<string, string | number | boolean> }) => {
      const span = createMockSpan(name, options?.attributes);
      spans.push(span);
      return span;
    }),
  };
}

/**
 * Mock tracer provider that returns a mock tracer
 */
function createMockTracerProvider() {
  const tracer = createMockTracer();

  return {
    tracer, // Expose for test assertions
    getTracer: vi.fn((_name: string, _version?: string) => tracer),
  };
}

describe("OTEL Hooks", () => {
  let mockTracerProvider: ReturnType<typeof createMockTracerProvider>;
  let mockTracer: ReturnType<typeof createMockTracer>;
  let config: OtelHooksConfig;

  beforeEach(() => {
    mockTracerProvider = createMockTracerProvider();
    mockTracer = mockTracerProvider.tracer;
    config = {
      tracerProvider: mockTracerProvider,
      promptName: "test-prompt",
      model: "claude-sonnet-4-20250514",
      userId: "user-123",
    };
  });

  describe("Constants", () => {
    it("should export GenAIAttributes with correct attribute names", () => {
      expect(GenAIAttributes.SYSTEM).toBe("gen_ai.system");
      expect(GenAIAttributes.REQUEST_MODEL).toBe("gen_ai.request.model");
      expect(GenAIAttributes.USAGE_INPUT_TOKENS).toBe("gen_ai.usage.input_tokens");
      expect(GenAIAttributes.USAGE_OUTPUT_TOKENS).toBe("gen_ai.usage.output_tokens");
      expect(GenAIAttributes.RESPONSE_FINISH_REASONS).toBe("gen_ai.response.finish_reasons");
      expect(GenAIAttributes.TOOL_NAME).toBe("gen_ai.tool.name");
      expect(GenAIAttributes.TOOL_CALL_ID).toBe("gen_ai.tool.call.id");
    });

    it("should export AgentMarkAttributes with correct attribute names", () => {
      expect(AgentMarkAttributes.PROMPT_NAME).toBe("agentmark.prompt_name");
      expect(AgentMarkAttributes.SESSION_ID).toBe("agentmark.session_id");
      expect(AgentMarkAttributes.USER_ID).toBe("agentmark.user_id");
    });

    it("should export SpanNames with correct span names", () => {
      expect(SpanNames.SESSION).toBe("gen_ai.session");
      expect(SpanNames.TOOL_CALL).toBe("gen_ai.tool.call");
      expect(SpanNames.SUBAGENT).toBe("gen_ai.subagent");
    });
  });

  describe("createTelemetryContext", () => {
    it("should create a telemetry context with empty maps", () => {
      const ctx = createTelemetryContext(config);

      expect(ctx.rootSpan).toBeUndefined();
      expect(ctx.activeToolSpans).toBeInstanceOf(Map);
      expect(ctx.activeToolSpans.size).toBe(0);
      expect(ctx.activeSubagentSpans).toBeInstanceOf(Map);
      expect(ctx.activeSubagentSpans.size).toBe(0);
      expect(ctx.tracer).toBe(mockTracer); // Tracer created from provider
      expect(ctx.config).toBe(config);
    });

    it("should create tracer with correct scope name", () => {
      createTelemetryContext(config);

      expect(mockTracerProvider.getTracer).toHaveBeenCalledWith("agentmark");
    });
  });

  describe("createOtelHooks", () => {
    it("should return hooks and context", () => {
      const result = createOtelHooks(config);

      expect(result.hooks).toBeDefined();
      expect(result.context).toBeDefined();
      expect(result.hooks.SessionStart).toBeDefined();
      expect(result.hooks.SessionEnd).toBeDefined();
      expect(result.hooks.PreToolUse).toBeDefined();
      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PostToolUseFailure).toBeDefined();
      expect(result.hooks.Stop).toBeDefined();
      expect(result.hooks.SubagentStart).toBeDefined();
      expect(result.hooks.SubagentStop).toBeDefined();
    });
  });

  describe("Session Span Tests", () => {
    it("should create root session span on SessionStart", async () => {
      const { hooks, context } = createOtelHooks(config);
      const sessionStartHook = hooks.SessionStart!.hooks[0];

      await sessionStartHook(
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        SpanNames.SESSION,
        expect.objectContaining({
          attributes: expect.objectContaining({
            [GenAIAttributes.SYSTEM]: "anthropic",
            [AgentMarkAttributes.PROMPT_NAME]: "test-prompt",
            [GenAIAttributes.REQUEST_MODEL]: "claude-sonnet-4-20250514",
            [AgentMarkAttributes.SESSION_ID]: "session-123",
            [AgentMarkAttributes.USER_ID]: "user-123",
          }),
        })
      );
      expect(context.rootSpan).toBeDefined();
    });

    it("should end root session span on SessionEnd", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session first
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.ended).toBe(false);

      // End session
      await hooks.SessionEnd!.hooks[0](
        {
          hook_event_name: "SessionEnd",
          session_id: "session-123",
          input_tokens: 100,
          output_tokens: 50,
          reason: "end_turn",
        },
        null,
        { signal: new AbortController().signal }
      );

      expect(rootSpan.ended).toBe(true);
      expect(rootSpan.status?.code).toBe(1); // OK
      expect(rootSpan.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(rootSpan.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(50);
      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe(
        JSON.stringify(["end_turn"])
      );
      expect(context.rootSpan).toBeUndefined();
    });

    it("should end root session span on Stop (before SessionEnd)", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];

      // Stop (not SessionEnd)
      await hooks.Stop!.hooks[0](
        {
          hook_event_name: "Stop",
          session_id: "session-123",
          reason: "user_cancelled",
          input_tokens: 80,
          output_tokens: 40,
        },
        null,
        { signal: new AbortController().signal }
      );

      expect(rootSpan.ended).toBe(true);
      expect(rootSpan.status?.code).toBe(1); // OK
      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe(
        JSON.stringify(["user_cancelled"])
      );
      expect(context.rootSpan).toBeUndefined();
    });
  });

  describe("Tool Span Tests", () => {
    it("should create child tool span on PreToolUse", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session first
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse!.hooks[0](
        {
          hook_event_name: "PreToolUse",
          session_id: "session-123",
          tool_name: "read_file",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledTimes(2);
      expect(mockTracer.spans[1].name).toBe("gen_ai.tool.call read_file");
      expect(mockTracer.spans[1].attributes[GenAIAttributes.TOOL_NAME]).toBe("read_file");
      expect(mockTracer.spans[1].attributes[GenAIAttributes.TOOL_CALL_ID]).toBe("tool-use-456");
      expect(context.activeToolSpans.has("tool-use-456")).toBe(true);
    });

    it("should end tool span with OK status on PostToolUse", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse!.hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = mockTracer.spans[1];
      expect(toolSpan.ended).toBe(false);

      // Post tool use
      await hooks.PostToolUse!.hooks[0](
        { hook_event_name: "PostToolUse", session_id: "session-123" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan.ended).toBe(true);
      expect(toolSpan.status?.code).toBe(1); // OK
      expect(context.activeToolSpans.has("tool-use-456")).toBe(false);
    });

    it("should end tool span with ERROR status on PostToolUseFailure", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse!.hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = mockTracer.spans[1];

      // Tool failure
      await hooks.PostToolUseFailure!.hooks[0](
        {
          hook_event_name: "PostToolUseFailure",
          session_id: "session-123",
          error: "File not found",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan.ended).toBe(true);
      expect(toolSpan.status?.code).toBe(2); // ERROR
      expect(toolSpan.status?.message).toBe("File not found");
      expect(context.activeToolSpans.has("tool-use-456")).toBe(false);
    });

    it("should record exception on tool failure", async () => {
      const { hooks } = createOtelHooks(config);

      // Start session
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse!.hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = mockTracer.spans[1];

      // Tool failure
      await hooks.PostToolUseFailure!.hooks[0](
        {
          hook_event_name: "PostToolUseFailure",
          session_id: "session-123",
          error: "Permission denied",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan.exceptions.length).toBe(1);
      expect(toolSpan.exceptions[0].message).toBe("Permission denied");
    });
  });

  describe("Attribute Tests", () => {
    it("should include GenAI semantic convention attributes on session span", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.attributes[GenAIAttributes.SYSTEM]).toBe("anthropic");
      expect(rootSpan.attributes[GenAIAttributes.REQUEST_MODEL]).toBe("claude-sonnet-4-20250514");
    });

    it("should include AgentMark-specific attributes on spans", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.attributes[AgentMarkAttributes.PROMPT_NAME]).toBe("test-prompt");
      expect(rootSpan.attributes[AgentMarkAttributes.SESSION_ID]).toBe("session-123");
      expect(rootSpan.attributes[AgentMarkAttributes.USER_ID]).toBe("user-123");
    });

    it("should include additional attributes when provided", async () => {
      const configWithExtras: OtelHooksConfig = {
        ...config,
        additionalAttributes: {
          "custom.attribute": "custom-value",
          "custom.number": 42,
        },
      };

      const { hooks } = createOtelHooks(configWithExtras);

      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.attributes["custom.attribute"]).toBe("custom-value");
      expect(rootSpan.attributes["custom.number"]).toBe(42);
    });
  });

  describe("Hierarchy Tests", () => {
    it("should maintain multiple tool spans correctly", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "session-123" },
        null,
        { signal: new AbortController().signal }
      );

      // First tool
      await hooks.PreToolUse!.hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-1",
        { signal: new AbortController().signal }
      );

      // Second tool (overlapping)
      await hooks.PreToolUse!.hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "write_file" },
        "tool-2",
        { signal: new AbortController().signal }
      );

      expect(context.activeToolSpans.size).toBe(2);
      expect(context.activeToolSpans.has("tool-1")).toBe(true);
      expect(context.activeToolSpans.has("tool-2")).toBe(true);

      // End first tool
      await hooks.PostToolUse!.hooks[0](
        { hook_event_name: "PostToolUse", session_id: "session-123" },
        "tool-1",
        { signal: new AbortController().signal }
      );

      expect(context.activeToolSpans.size).toBe(1);
      expect(context.activeToolSpans.has("tool-1")).toBe(false);
      expect(context.activeToolSpans.has("tool-2")).toBe(true);

      // End second tool
      await hooks.PostToolUse!.hooks[0](
        { hook_event_name: "PostToolUse", session_id: "session-123" },
        "tool-2",
        { signal: new AbortController().signal }
      );

      expect(context.activeToolSpans.size).toBe(0);
    });
  });

  describe("Subagent Tests", () => {
    it("should create and end subagent spans", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Subagent start
      await hooks.SubagentStart!.hooks[0](
        {
          hook_event_name: "SubagentStart",
          session_id: "subagent-session-1",
          subagent_type: "explore",
        },
        null,
        { signal: new AbortController().signal }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        SpanNames.SUBAGENT,
        expect.objectContaining({
          attributes: expect.objectContaining({
            [AgentMarkAttributes.SUBAGENT_TYPE]: "explore",
          }),
        })
      );
      expect(context.activeSubagentSpans.has("subagent-session-1")).toBe(true);

      // Subagent stop
      await hooks.SubagentStop!.hooks[0](
        { hook_event_name: "SubagentStop", session_id: "subagent-session-1" },
        null,
        { signal: new AbortController().signal }
      );

      const subagentSpan = mockTracer.spans[0];
      expect(subagentSpan.ended).toBe(true);
      expect(subagentSpan.status?.code).toBe(1); // OK
      expect(context.activeSubagentSpans.has("subagent-session-1")).toBe(false);
    });
  });

  describe("combineWithOtelHooks", () => {
    it("should merge OTEL hooks with other hooks", () => {
      const { hooks: otelHooks } = createOtelHooks(config);

      const customHook = vi.fn(async () => ({ continue: true }));
      const customHooks: HooksConfig = {
        SessionStart: { hooks: [customHook] },
        PreToolUse: { hooks: [customHook] },
      };

      const combined = combineWithOtelHooks(otelHooks, customHooks);

      // OTEL hooks + custom hooks
      expect(combined.SessionStart!.hooks.length).toBe(2);
      expect(combined.PreToolUse!.hooks.length).toBe(2);

      // OTEL hooks first
      expect(combined.SessionStart!.hooks[0]).toBe(otelHooks.SessionStart!.hooks[0]);
      expect(combined.SessionStart!.hooks[1]).toBe(customHook);
    });

    it("should handle multiple hook sets", () => {
      const { hooks: otelHooks } = createOtelHooks(config);

      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));

      const hooks1: HooksConfig = {
        SessionStart: { hooks: [hook1] },
      };
      const hooks2: HooksConfig = {
        SessionStart: { hooks: [hook2] },
      };

      const combined = combineWithOtelHooks(otelHooks, hooks1, hooks2);

      // OTEL + hook1 + hook2
      expect(combined.SessionStart!.hooks.length).toBe(3);
      expect(combined.SessionStart!.hooks[0]).toBe(otelHooks.SessionStart!.hooks[0]);
      expect(combined.SessionStart!.hooks[1]).toBe(hook1);
      expect(combined.SessionStart!.hooks[2]).toBe(hook2);
    });

    it("should preserve hooks for events not in OTEL hooks", () => {
      // Create minimal OTEL hooks (only SessionStart for this test)
      const { hooks: otelHooks } = createOtelHooks(config);

      // Remove some hooks to simulate partial coverage
      const partialOtelHooks: HooksConfig = {
        SessionStart: otelHooks.SessionStart,
      };

      const customHook = vi.fn(async () => ({ continue: true }));
      const customHooks: HooksConfig = {
        SessionEnd: { hooks: [customHook] },
      };

      const combined = combineWithOtelHooks(partialOtelHooks, customHooks);

      expect(combined.SessionStart).toBeDefined();
      expect(combined.SessionEnd!.hooks.length).toBe(1);
      expect(combined.SessionEnd!.hooks[0]).toBe(customHook);
    });
  });
});
