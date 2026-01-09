import { describe, it, expect, vi } from "vitest";
import {
  createTelemetryHooks,
  mergeHooks,
  type HookEventName,
  type TelemetryEvent,
} from "../src/hooks/telemetry-hooks";
import type { HookInput } from "../src/types";

describe("Telemetry Hooks", () => {
  describe("createTelemetryHooks", () => {
    it("should return empty hooks when telemetry is disabled", () => {
      const hooks = createTelemetryHooks({
        isEnabled: false,
        promptName: "test-prompt",
        props: {},
      });

      expect(Object.keys(hooks)).toHaveLength(0);
    });

    it("should create all required hooks when telemetry is enabled", () => {
      const hooks = createTelemetryHooks({
        isEnabled: true,
        promptName: "test-prompt",
        props: {},
      });

      expect(hooks.SessionStart).toBeDefined();
      expect(hooks.SessionEnd).toBeDefined();
      expect(hooks.PreToolUse).toBeDefined();
      expect(hooks.PostToolUse).toBeDefined();
      expect(hooks.PostToolUseFailure).toBeDefined();
      expect(hooks.Stop).toBeDefined();
      expect(hooks.SubagentStart).toBeDefined();
      expect(hooks.SubagentStop).toBeDefined();
    });

    it("should call event handler with correct data for SessionStart", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          functionId: "func-123",
          metadata: { userId: "user-1" },
          props: { task: "test" },
        },
        eventHandler
      );

      const mockInput: HookInput = {
        hook_event_name: "SessionStart",
        session_id: "session-123",
        cwd: "/test/dir",
        transcript_path: "/test/transcript.json",
      };

      const result = await hooks.SessionStart!.hooks[0](
        mockInput,
        null,
        { signal: new AbortController().signal }
      );

      expect(result).toEqual({ continue: true });
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "session_start",
          sessionId: "session-123",
          promptName: "test-prompt",
          data: expect.objectContaining({
            cwd: "/test/dir",
            transcript_path: "/test/transcript.json",
            functionId: "func-123",
            metadata: { userId: "user-1" },
            props: { task: "test" },
          }),
        })
      );
    });

    it("should call event handler for PreToolUse with tool info", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      const mockInput: HookInput = {
        hook_event_name: "PreToolUse",
        session_id: "session-123",
        tool_name: "Read",
        tool_input: { file_path: "/test/file.ts" },
      };

      await hooks.PreToolUse!.hooks[0](
        mockInput,
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "tool_start",
          data: expect.objectContaining({
            tool_name: "Read",
            tool_input: { file_path: "/test/file.ts" },
            tool_use_id: "tool-use-456",
          }),
        })
      );
    });

    it("should call event handler for PostToolUse with response", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      const mockInput: HookInput = {
        hook_event_name: "PostToolUse",
        session_id: "session-123",
        tool_name: "Read",
        tool_response: { content: "file contents" },
      };

      await hooks.PostToolUse!.hooks[0](
        mockInput,
        "tool-use-456",
        { signal: new AbortController().signal }
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "tool_end",
          data: expect.objectContaining({
            tool_name: "Read",
            tool_response: { content: "file contents" },
            tool_use_id: "tool-use-456",
          }),
        })
      );
    });

    it("should call event handler for PostToolUseFailure with error", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      const mockInput: HookInput = {
        hook_event_name: "PostToolUseFailure",
        session_id: "session-123",
        tool_name: "Bash",
        error: "Command failed with exit code 1",
      };

      await hooks.PostToolUseFailure!.hooks[0](
        mockInput,
        "tool-use-789",
        { signal: new AbortController().signal }
      );

      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "tool_error",
          data: expect.objectContaining({
            tool_name: "Bash",
            error: "Command failed with exit code 1",
            tool_use_id: "tool-use-789",
          }),
        })
      );
    });

    it("should include timestamp in events", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      const before = Date.now();
      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );
      const after = Date.now();

      expect(eventHandler).toHaveBeenCalled();
      const event = eventHandler.mock.calls[0][0] as TelemetryEvent;
      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it("should work without event handler (no-op)", async () => {
      const hooks = createTelemetryHooks({
        isEnabled: true,
        promptName: "test-prompt",
        props: {},
      });

      // Should not throw
      const result = await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );

      expect(result).toEqual({ continue: true });
    });

    it("should handle async event handlers", async () => {
      const eventHandler = vi.fn(async (_event: TelemetryEvent) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      await hooks.SessionStart!.hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );

      expect(eventHandler).toHaveBeenCalled();
    });
  });

  describe("mergeHooks", () => {
    it("should merge hooks from multiple configurations", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));

      const config1 = {
        SessionStart: { hooks: [hook1] },
      };

      const config2 = {
        SessionStart: { hooks: [hook2] },
        SessionEnd: { hooks: [hook1] },
      };

      const merged = mergeHooks(config1, config2);

      expect(merged.SessionStart?.hooks).toHaveLength(2);
      expect(merged.SessionStart?.hooks[0]).toBe(hook1);
      expect(merged.SessionStart?.hooks[1]).toBe(hook2);
      expect(merged.SessionEnd?.hooks).toHaveLength(1);
    });

    it("should handle empty configurations", () => {
      const hook = vi.fn(async () => ({ continue: true }));

      const merged = mergeHooks({}, { SessionStart: { hooks: [hook] } }, {});

      expect(merged.SessionStart?.hooks).toHaveLength(1);
    });

    it("should return empty object when no configs provided", () => {
      const merged = mergeHooks();
      expect(Object.keys(merged)).toHaveLength(0);
    });

    it("should preserve hook order across merges", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));
      const hook3 = vi.fn(async () => ({ continue: true }));

      const merged = mergeHooks(
        { PreToolUse: { hooks: [hook1] } },
        { PreToolUse: { hooks: [hook2] } },
        { PreToolUse: { hooks: [hook3] } }
      );

      expect(merged.PreToolUse?.hooks).toEqual([hook1, hook2, hook3]);
    });

    it("should not mutate original configurations", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));

      const config1 = { SessionStart: { hooks: [hook1] } };
      const config2 = { SessionStart: { hooks: [hook2] } };

      mergeHooks(config1, config2);

      expect(config1.SessionStart.hooks).toHaveLength(1);
      expect(config2.SessionStart.hooks).toHaveLength(1);
    });
  });

  describe("Hook Event Coverage", () => {
    const allEvents: HookEventName[] = [
      "SessionStart",
      "SessionEnd",
      "PreToolUse",
      "PostToolUse",
      "PostToolUseFailure",
      "Stop",
      "SubagentStart",
      "SubagentStop",
    ];

    it("should create hooks for all expected events", () => {
      const hooks = createTelemetryHooks({
        isEnabled: true,
        promptName: "test",
        props: {},
      });

      for (const event of allEvents) {
        expect(hooks[event]).toBeDefined();
        expect(hooks[event]?.hooks).toHaveLength(1);
      }
    });

    it("should not create hooks for permission-related events", () => {
      const hooks = createTelemetryHooks({
        isEnabled: true,
        promptName: "test",
        props: {},
      });

      // These events are not typically traced
      expect(hooks.PreCompact).toBeUndefined();
      expect(hooks.PermissionRequest).toBeUndefined();
      expect(hooks.Notification).toBeUndefined();
      expect(hooks.UserPromptSubmit).toBeUndefined();
    });
  });
});
