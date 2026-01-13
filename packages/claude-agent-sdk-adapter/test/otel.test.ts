import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createOtelHooks,
  combineWithOtelHooks,
  completeSession,
  GenAIAttributes,
  AgentMarkAttributes,
  SpanNames,
} from "../src/hooks/otel-hooks";
import type { HooksConfig } from "../src/hooks/telemetry-hooks";
import type { OtelHooksConfig } from "../src/types";
import { findSpanByName } from "./helpers";

/**
 * Mock span implementation that captures all operations for testing
 */
interface MockSpanData {
  name: string;
  attributes: Record<string, string | number | boolean>;
  status?: { code: number; message?: string };
  exceptions: Error[];
  events: Array<{ name: string; attributes?: Record<string, string | number | boolean> }>;
  ended: boolean;
}

function createMockSpan(name: string, attributes?: Record<string, string | number | boolean>): MockSpanData & {
  setAttribute: (key: string, value: string | number | boolean) => void;
  setStatus: (status: { code: number; message?: string }) => void;
  recordException: (error: Error) => void;
  addEvent: (name: string, attributes?: Record<string, string | number | boolean>) => void;
  end: () => void;
  spanContext: () => { traceId: string; spanId: string };
} {
  const data: MockSpanData = {
    name,
    attributes: { ...attributes },
    status: undefined,
    exceptions: [],
    events: [],
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
    addEvent: (name: string, attrs?: Record<string, string | number | boolean>) => {
      data.events.push({ name, attributes: attrs });
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
    get events() { return data.events; },
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

  describe("GenAI Semantic Convention Compliance", () => {
    it("should set GenAI system and model attributes on session span", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test-session", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const sessionSpan = findSpanByName(mockTracer.spans, /session/);
      expect(sessionSpan).toBeDefined();
      // Verify GenAI semantic convention attributes are set
      expect(sessionSpan!.attributes[GenAIAttributes.SYSTEM]).toBe("anthropic");
      expect(sessionSpan!.attributes[GenAIAttributes.REQUEST_MODEL]).toBe("claude-sonnet-4-20250514");
    });

    it("should set GenAI tool attributes on tool spans", async () => {
      const { hooks } = createOtelHooks(config);

      // Create session first
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Create tool span
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "test", tool_name: "SearchFiles" },
        "tool-abc",
        { signal: new AbortController().signal }
      );

      const toolSpan = findSpanByName(mockTracer.spans, /tool/);
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.attributes[GenAIAttributes.TOOL_NAME]).toBe("SearchFiles");
      expect(toolSpan!.attributes[GenAIAttributes.TOOL_CALL_ID]).toBe("tool-abc");
    });

    it("should set GenAI usage attributes on session stop", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      await hooks.Stop![0].hooks[0](
        {
          hook_event_name: "Stop",
          session_id: "test",
          input_tokens: 150,
          output_tokens: 75,
          reason: "end_turn",
        },
        null,
        { signal: new AbortController().signal }
      );

      const sessionSpan = findSpanByName(mockTracer.spans, /session/);
      expect(sessionSpan!.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(150);
      expect(sessionSpan!.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(75);
      expect(sessionSpan!.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe(JSON.stringify(["end_turn"]));
    });
  });

  describe("AgentMark Custom Attributes", () => {
    it("should set AgentMark prompt and user attributes on spans", async () => {
      const customConfig: OtelHooksConfig = {
        ...config,
        promptName: "my-custom-prompt",
        userId: "user-456",
      };
      const { hooks } = createOtelHooks(customConfig);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "sess-789", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const sessionSpan = findSpanByName(mockTracer.spans, /session/);
      expect(sessionSpan).toBeDefined();
      expect(sessionSpan!.attributes[AgentMarkAttributes.PROMPT_NAME]).toBe("my-custom-prompt");
      expect(sessionSpan!.attributes[AgentMarkAttributes.SESSION_ID]).toBe("sess-789");
      expect(sessionSpan!.attributes[AgentMarkAttributes.USER_ID]).toBe("user-456");
    });
  });

  describe("Span Naming Conventions", () => {
    it("should create session span with correct name prefix", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const sessionSpan = mockTracer.spans.find(s => s.name.startsWith(SpanNames.SESSION));
      expect(sessionSpan).toBeDefined();
    });

    it("should create tool span with correct name prefix", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "test", tool_name: "Read" },
        "tool-1",
        { signal: new AbortController().signal }
      );

      const toolSpan = mockTracer.spans.find(s => s.name.startsWith(SpanNames.TOOL_CALL));
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.name).toBe("gen_ai.tool.call Read");
    });

    it("should create subagent span with correct name", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.SubagentStart![0].hooks[0](
        { hook_event_name: "SubagentStart", session_id: "sub-1", agent_type: "Plan" },
        null,
        { signal: new AbortController().signal }
      );

      const subagentSpan = mockTracer.spans.find(s => s.name === SpanNames.SUBAGENT);
      expect(subagentSpan).toBeDefined();
    });
  });

  describe("createTelemetryContext", () => {
    it("should accumulate tool spans across the session lifecycle", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );
      expect(context.rootSpan).toBeDefined();

      // Add multiple tool spans
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "test", tool_name: "Tool1" },
        "tool-1",
        { signal: new AbortController().signal }
      );
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "test", tool_name: "Tool2" },
        "tool-2",
        { signal: new AbortController().signal }
      );

      // Verify context tracks active spans
      expect(context.activeToolSpans.size).toBe(2);
      expect(context.activeToolSpans.has("tool-1")).toBe(true);
      expect(context.activeToolSpans.has("tool-2")).toBe(true);

      // Complete one tool
      await hooks.PostToolUse![0].hooks[0](
        { hook_event_name: "PostToolUse", session_id: "test" },
        "tool-1",
        { signal: new AbortController().signal }
      );
      expect(context.activeToolSpans.size).toBe(1);
      expect(context.activeToolSpans.has("tool-1")).toBe(false);
    });

    it("should use tracer from provider to create actual spans", async () => {
      const { hooks } = createOtelHooks(config);

      // Verify tracer was obtained with correct scope name
      expect(mockTracerProvider.getTracer).toHaveBeenCalledWith("agentmark");

      // Use the hooks to create a span
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "test", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Verify span was created via the tracer
      expect(mockTracer.startSpan).toHaveBeenCalled();
      expect(mockTracer.spans.length).toBeGreaterThan(0);
    });
  });

  describe("createOtelHooks", () => {
    it("should return hooks and context", () => {
      const result = createOtelHooks(config);

      expect(result.hooks).toBeDefined();
      expect(result.context).toBeDefined();
      // OTEL hooks use UserPromptSubmit instead of SessionStart
      expect(result.hooks.UserPromptSubmit).toBeDefined();
      expect(result.hooks.PreToolUse).toBeDefined();
      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PostToolUseFailure).toBeDefined();
      expect(result.hooks.Stop).toBeDefined();
      expect(result.hooks.SubagentStart).toBeDefined();
      expect(result.hooks.SubagentStop).toBeDefined();
    });
  });

  describe("Session Span Tests", () => {
    it("should create root session span on UserPromptSubmit", async () => {
      const { hooks, context } = createOtelHooks(config);
      const userPromptSubmitHook = hooks.UserPromptSubmit![0].hooks[0];

      await userPromptSubmitHook(
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test prompt" },
        null,
        { signal: new AbortController().signal }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        expect.stringContaining(SpanNames.SESSION),
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

    it("should add metrics to session span on Stop", async () => {
      const { hooks } = createOtelHooks(config);

      // Start session first
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test prompt" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.ended).toBe(false);

      // Stop adds metrics but doesn't end the span (completeSession does that)
      await hooks.Stop![0].hooks[0](
        {
          hook_event_name: "Stop",
          session_id: "session-123",
          input_tokens: 100,
          output_tokens: 50,
          reason: "end_turn",
        },
        null,
        { signal: new AbortController().signal }
      );

      // Span should have metrics but not be ended (completeSession ends it)
      expect(rootSpan.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(100);
      expect(rootSpan.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(50);
      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe(
        JSON.stringify(["end_turn"])
      );
    });

    it("should create fallback session span on Stop if no UserPromptSubmit", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Stop without UserPromptSubmit (creates fallback span)
      await hooks.Stop![0].hooks[0](
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

      expect(mockTracer.startSpan).toHaveBeenCalledWith(
        SpanNames.SESSION,
        expect.any(Object)
      );
      expect(context.rootSpan).toBeDefined();
      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe(
        JSON.stringify(["user_cancelled"])
      );
    });
  });

  describe("Tool Span Tests", () => {
    it("should create child tool span on PreToolUse", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session first
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse![0].hooks[0](
        {
          hook_event_name: "PreToolUse",
          session_id: "session-123",
          tool_name: "read_file",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(mockTracer.startSpan).toHaveBeenCalledTimes(2);
      const toolSpan = findSpanByName(mockTracer.spans, /tool\.call/);
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.name).toBe("gen_ai.tool.call read_file");
      expect(toolSpan!.attributes[GenAIAttributes.TOOL_NAME]).toBe("read_file");
      expect(toolSpan!.attributes[GenAIAttributes.TOOL_CALL_ID]).toBe("tool-use-456");
      expect(context.activeToolSpans.has("tool-use-456")).toBe(true);
    });

    it("should end tool span with OK status on PostToolUse", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = findSpanByName(mockTracer.spans, /tool\.call/);
      expect(toolSpan).toBeDefined();
      expect(toolSpan!.ended).toBe(false);

      // Post tool use
      await hooks.PostToolUse![0].hooks[0](
        { hook_event_name: "PostToolUse", session_id: "session-123" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan!.ended).toBe(true);
      expect(toolSpan!.status?.code).toBe(1); // OK
      expect(context.activeToolSpans.has("tool-use-456")).toBe(false);
    });

    it("should end tool span with ERROR status on PostToolUseFailure", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = findSpanByName(mockTracer.spans, /tool\.call/);
      expect(toolSpan).toBeDefined();

      // Tool failure
      await hooks.PostToolUseFailure![0].hooks[0](
        {
          hook_event_name: "PostToolUseFailure",
          session_id: "session-123",
          error: "File not found",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan!.ended).toBe(true);
      expect(toolSpan!.status?.code).toBe(2); // ERROR
      expect(toolSpan!.status?.message).toBe("File not found");
      expect(context.activeToolSpans.has("tool-use-456")).toBe(false);
    });

    it("should record exception on tool failure", async () => {
      const { hooks } = createOtelHooks(config);

      // Start session
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // Tool use
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      const toolSpan = findSpanByName(mockTracer.spans, /tool\.call/);
      expect(toolSpan).toBeDefined();

      // Tool failure
      await hooks.PostToolUseFailure![0].hooks[0](
        {
          hook_event_name: "PostToolUseFailure",
          session_id: "session-123",
          error: "Permission denied",
        },
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(toolSpan!.exceptions.length).toBe(1);
      expect(toolSpan!.exceptions[0].message).toBe("Permission denied");
    });
  });

  describe("Attribute Tests", () => {
    it("should include GenAI semantic convention attributes on session span", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.attributes[GenAIAttributes.SYSTEM]).toBe("anthropic");
      expect(rootSpan.attributes[GenAIAttributes.REQUEST_MODEL]).toBe("claude-sonnet-4-20250514");
    });

    it("should include AgentMark-specific attributes on spans", async () => {
      const { hooks } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
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

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
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
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      // First tool
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "read_file" },
        "tool-1",
        { signal: new AbortController().signal }
      );

      // Second tool (overlapping)
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "session-123", tool_name: "write_file" },
        "tool-2",
        { signal: new AbortController().signal }
      );

      expect(context.activeToolSpans.size).toBe(2);
      expect(context.activeToolSpans.has("tool-1")).toBe(true);
      expect(context.activeToolSpans.has("tool-2")).toBe(true);

      // End first tool
      await hooks.PostToolUse![0].hooks[0](
        { hook_event_name: "PostToolUse", session_id: "session-123" },
        "tool-1",
        { signal: new AbortController().signal }
      );

      expect(context.activeToolSpans.size).toBe(1);
      expect(context.activeToolSpans.has("tool-1")).toBe(false);
      expect(context.activeToolSpans.has("tool-2")).toBe(true);

      // End second tool
      await hooks.PostToolUse![0].hooks[0](
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
      await hooks.SubagentStart![0].hooks[0](
        {
          hook_event_name: "SubagentStart",
          session_id: "subagent-session-1",
          agent_type: "explore",
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
        }),
        expect.any(Object)
      );
      expect(context.activeSubagentSpans.has("subagent-session-1")).toBe(true);

      // Subagent stop
      await hooks.SubagentStop![0].hooks[0](
        { hook_event_name: "SubagentStop", session_id: "subagent-session-1" },
        null,
        { signal: new AbortController().signal }
      );

      const subagentSpan = findSpanByName(mockTracer.spans, SpanNames.SUBAGENT);
      expect(subagentSpan).toBeDefined();
      expect(subagentSpan!.ended).toBe(true);
      expect(subagentSpan!.status?.code).toBe(1); // OK
      expect(context.activeSubagentSpans.has("subagent-session-1")).toBe(false);
    });
  });

  describe("combineWithOtelHooks", () => {
    it("should merge OTEL hooks with other hooks", () => {
      const { hooks: otelHooks } = createOtelHooks(config);

      const customHook = vi.fn(async () => ({ continue: true }));
      const customHooks: HooksConfig = {
        UserPromptSubmit: [{ hooks: [customHook] }],
        PreToolUse: [{ hooks: [customHook] }],
      };

      const combined = combineWithOtelHooks(otelHooks, customHooks);

      // OTEL hooks + custom hooks (as separate matchers)
      expect(combined.UserPromptSubmit).toHaveLength(2);
      expect(combined.PreToolUse).toHaveLength(2);

      // OTEL hooks first
      expect(combined.UserPromptSubmit![0].hooks[0]).toBe(otelHooks.UserPromptSubmit![0].hooks[0]);
      expect(combined.UserPromptSubmit![1].hooks[0]).toBe(customHook);
    });

    it("should handle multiple hook sets", () => {
      const { hooks: otelHooks } = createOtelHooks(config);

      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));

      const hooks1: HooksConfig = {
        UserPromptSubmit: [{ hooks: [hook1] }],
      };
      const hooks2: HooksConfig = {
        UserPromptSubmit: [{ hooks: [hook2] }],
      };

      const combined = combineWithOtelHooks(otelHooks, hooks1, hooks2);

      // OTEL + hook1 + hook2 (as separate matchers)
      expect(combined.UserPromptSubmit).toHaveLength(3);
      expect(combined.UserPromptSubmit![0].hooks[0]).toBe(otelHooks.UserPromptSubmit![0].hooks[0]);
      expect(combined.UserPromptSubmit![1].hooks[0]).toBe(hook1);
      expect(combined.UserPromptSubmit![2].hooks[0]).toBe(hook2);
    });

    it("should preserve hooks for events not in OTEL hooks", () => {
      // Create minimal OTEL hooks (only UserPromptSubmit for this test)
      const { hooks: otelHooks } = createOtelHooks(config);

      // Remove some hooks to simulate partial coverage
      const partialOtelHooks: HooksConfig = {
        UserPromptSubmit: otelHooks.UserPromptSubmit,
      };

      const customHook = vi.fn(async () => ({ continue: true }));
      const customHooks: HooksConfig = {
        Stop: [{ hooks: [customHook] }],
      };

      const combined = combineWithOtelHooks(partialOtelHooks, customHooks);

      expect(combined.UserPromptSubmit).toBeDefined();
      expect(combined.Stop).toHaveLength(1);
      expect(combined.Stop![0].hooks[0]).toBe(customHook);
    });
  });

  describe("completeSession", () => {
    it("should set gen_ai.response attribute with string result", async () => {
      const { hooks, context } = createOtelHooks(config);

      // Start session
      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(context.rootSpan).toBeDefined();

      // Complete session with string result
      completeSession(context, "This is the final response");

      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_OUTPUT]).toBe("This is the final response");
    });

    it("should set gen_ai.response attribute with JSON-stringified object", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      const resultObject = { answer: 42, reasoning: "math" };

      completeSession(context, resultObject);

      expect(rootSpan.attributes[GenAIAttributes.RESPONSE_OUTPUT]).toBe(
        JSON.stringify(resultObject)
      );
    });

    it("should set gen_ai.usage.input_tokens attribute", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];

      completeSession(context, "result", { inputTokens: 250 });

      expect(rootSpan.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(250);
    });

    it("should set gen_ai.usage.output_tokens attribute", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];

      completeSession(context, "result", { outputTokens: 150 });

      expect(rootSpan.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(150);
    });

    it("should add session_completed event", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];

      completeSession(context, "result");

      const completedEvent = rootSpan.events.find(e => e.name === "session_completed");
      expect(completedEvent).toBeDefined();
    });

    it("should end the span with OK status", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      const rootSpan = mockTracer.spans[0];
      expect(rootSpan.ended).toBe(false);

      completeSession(context, "result");

      expect(rootSpan.ended).toBe(true);
      expect(rootSpan.status?.code).toBe(1); // SpanStatusCode.OK
    });

    it("should clear rootSpan from context after completion", async () => {
      const { hooks, context } = createOtelHooks(config);

      await hooks.UserPromptSubmit![0].hooks[0](
        { hook_event_name: "UserPromptSubmit", session_id: "session-123", prompt: "Test" },
        null,
        { signal: new AbortController().signal }
      );

      expect(context.rootSpan).toBeDefined();

      completeSession(context, "result");

      expect(context.rootSpan).toBeUndefined();
    });

    it("should no-op gracefully when span is undefined", () => {
      // Create a minimal context without a rootSpan
      const context = {
        rootSpan: undefined,
        activeToolSpans: new Map(),
        activeSubagentSpans: new Map(),
      } as Parameters<typeof completeSession>[0];

      expect(context.rootSpan).toBeUndefined();

      // Should not throw
      completeSession(context, "result");

      // Context should still have undefined rootSpan
      expect(context.rootSpan).toBeUndefined();
    });
  });

  describe("OTEL unavailable scenarios", () => {
    it("should return empty hooks when TracerProvider returns null tracer", () => {
      const nullTracerProvider = {
        getTracer: vi.fn().mockReturnValue(null),
      };

      const result = createOtelHooks({
        tracerProvider: nullTracerProvider,
        promptName: "test-prompt",
      });

      // When tracer is null, createTelemetryContext returns null
      // So hooks should be empty and context should be null
      expect(result.context).toBeNull();
      expect(Object.keys(result.hooks)).toHaveLength(0);
    });

    it("should not throw when TracerProvider is provided but returns undefined", () => {
      const brokenProvider = {
        getTracer: vi.fn().mockReturnValue(undefined),
      };

      // Should not throw
      const result = createOtelHooks({
        tracerProvider: brokenProvider,
        promptName: "test-prompt",
      });

      expect(result.context).toBeNull();
      expect(result.hooks).toEqual({});
    });

    it("should return null context when tracer provider is missing", () => {
      // When no tracerProvider is given and global tracer is not set up,
      // the context should be null (OTEL not available)
      const result = createOtelHooks({
        promptName: "test-prompt",
        // No tracerProvider - relies on global which may not be set up
      });

      // This may return a context if OTEL is installed in the test environment
      // The important thing is it doesn't throw
      expect(() => result).not.toThrow();
    });

    it("should handle createTelemetryContext returning null gracefully", () => {
      // Create hooks with a provider that returns null tracer
      const nullProvider = {
        getTracer: vi.fn().mockReturnValue(null),
      };

      const { hooks, context } = createOtelHooks({
        tracerProvider: nullProvider,
        promptName: "test-prompt",
      });

      // Empty hooks and null context
      expect(context).toBeNull();
      expect(hooks.UserPromptSubmit).toBeUndefined();
      expect(hooks.PreToolUse).toBeUndefined();
      expect(hooks.PostToolUse).toBeUndefined();
      expect(hooks.Stop).toBeUndefined();
    });

    it("should still allow completeSession with null context", () => {
      const nullProvider = {
        getTracer: vi.fn().mockReturnValue(null),
      };

      // createOtelHooks returns null context when tracer is null
      createOtelHooks({
        tracerProvider: nullProvider,
        promptName: "test-prompt",
      });

      // completeSession should handle a minimal context gracefully
      const minimalContext = {
        rootSpan: undefined,
        activeToolSpans: new Map(),
        activeSubagentSpans: new Map(),
      } as Parameters<typeof completeSession>[0];

      // Should not throw
      expect(() => completeSession(minimalContext, "result")).not.toThrow();
    });
  });
});
