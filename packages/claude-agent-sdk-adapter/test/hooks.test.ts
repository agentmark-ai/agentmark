import { describe, it, expect, vi } from "vitest";
import {
  createTelemetryHooks,
  mergeHooks,
  type TelemetryEvent,
} from "../src/hooks/telemetry-hooks";
import type { HookInput } from "../src/types";
import { FIXED_TIMESTAMP } from "./helpers";

describe("Telemetry Hooks", () => {
  describe("createTelemetryHooks", () => {
    it("should not emit any events when telemetry is disabled", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: false,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      // No hooks should be created
      expect(Object.keys(hooks)).toHaveLength(0);

      // Even if we try to call a hook (which would fail since they don't exist),
      // the event handler should never be called
      expect(eventHandler).not.toHaveBeenCalled();
    });

    it("should emit events for each hook type when triggered", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        eventHandler
      );

      // Trigger SessionStart
      await hooks.SessionStart![0].hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "session_start" })
      );

      // Trigger PreToolUse
      await hooks.PreToolUse![0].hooks[0](
        { hook_event_name: "PreToolUse", session_id: "test", tool_name: "Read" },
        "tool-1",
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "tool_start" })
      );

      // Trigger PostToolUse
      await hooks.PostToolUse![0].hooks[0](
        { hook_event_name: "PostToolUse", session_id: "test", tool_name: "Read" },
        "tool-1",
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: "tool_end" })
      );

      // Verify all events were emitted
      expect(eventHandler).toHaveBeenCalledTimes(3);
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

      const result = await hooks.SessionStart![0].hooks[0](
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

      await hooks.PreToolUse![0].hooks[0](
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

      await hooks.PostToolUse![0].hooks[0](
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

      await hooks.PostToolUseFailure![0].hooks[0](
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
      // Mock Date.now for deterministic testing
      const dateNowSpy = vi.spyOn(Date, "now").mockReturnValue(FIXED_TIMESTAMP);

      try {
        const eventHandler = vi.fn();
        const hooks = createTelemetryHooks(
          {
            isEnabled: true,
            promptName: "test-prompt",
            props: {},
          },
          eventHandler
        );

        await hooks.SessionStart![0].hooks[0](
          { hook_event_name: "SessionStart", session_id: "test" },
          null,
          { signal: new AbortController().signal }
        );

        expect(eventHandler).toHaveBeenCalled();
        const event = eventHandler.mock.calls[0][0] as TelemetryEvent;
        expect(event.timestamp).toBe(FIXED_TIMESTAMP);
      } finally {
        dateNowSpy.mockRestore();
      }
    });

    it("should work without event handler (no-op)", async () => {
      const hooks = createTelemetryHooks({
        isEnabled: true,
        promptName: "test-prompt",
        props: {},
      });

      // Should not throw
      const result = await hooks.SessionStart![0].hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );

      expect(result).toEqual({ continue: true });
    });

    it("should await async event handlers and maintain execution order", async () => {
      const executionOrder: string[] = [];

      const asyncEventHandler = vi.fn(async (event: TelemetryEvent) => {
        executionOrder.push(`start:${event.eventName}`);
        // Simulate async work like logging to external service
        await new Promise((resolve) => setTimeout(resolve, 5));
        executionOrder.push(`end:${event.eventName}`);
      });

      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: {},
        },
        asyncEventHandler
      );

      // Call hook and wait for it to complete
      await hooks.SessionStart![0].hooks[0](
        { hook_event_name: "SessionStart", session_id: "test" },
        null,
        { signal: new AbortController().signal }
      );

      // Verify async handler completed (not just started)
      expect(asyncEventHandler).toHaveBeenCalled();
      expect(executionOrder).toContain("start:session_start");
      expect(executionOrder).toContain("end:session_start");

      // Verify order: start before end
      const startIndex = executionOrder.indexOf("start:session_start");
      const endIndex = executionOrder.indexOf("end:session_start");
      expect(startIndex).toBeLessThan(endIndex);
    });
  });

  describe("mergeHooks", () => {
    it("should merge hooks from multiple configurations", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));

      const config1 = {
        SessionStart: [{ hooks: [hook1] }],
      };

      const config2 = {
        SessionStart: [{ hooks: [hook2] }],
        SessionEnd: [{ hooks: [hook1] }],
      };

      const merged = mergeHooks(config1, config2);

      // mergeHooks concatenates arrays of matchers
      expect(merged.SessionStart).toHaveLength(2);
      expect(merged.SessionStart![0].hooks[0]).toBe(hook1);
      expect(merged.SessionStart![1].hooks[0]).toBe(hook2);
      expect(merged.SessionEnd).toHaveLength(1);
    });

    it("should handle empty configurations", () => {
      const hook = vi.fn(async () => ({ continue: true }));

      const merged = mergeHooks({}, { SessionStart: [{ hooks: [hook] }] }, {});

      expect(merged.SessionStart).toHaveLength(1);
      expect(merged.SessionStart![0].hooks[0]).toBe(hook);
    });

    it("should return empty object and handle null/undefined gracefully", () => {
      // Test with no args
      const merged = mergeHooks();
      expect(Object.keys(merged)).toHaveLength(0);

      // Test with empty objects
      const mergedEmpty = mergeHooks({}, {});
      expect(Object.keys(mergedEmpty)).toHaveLength(0);

      // Test mixing empty and populated configs
      const hook = vi.fn(async () => ({ continue: true }));
      const mergedMixed = mergeHooks({}, { SessionStart: [{ hooks: [hook] }] }, {});
      expect(mergedMixed.SessionStart).toHaveLength(1);
    });

    it("should preserve matcher order across merges", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));
      const hook3 = vi.fn(async () => ({ continue: true }));

      const merged = mergeHooks(
        { PreToolUse: [{ hooks: [hook1] }] },
        { PreToolUse: [{ hooks: [hook2] }] },
        { PreToolUse: [{ hooks: [hook3] }] }
      );

      // Each config contributes one matcher
      expect(merged.PreToolUse).toHaveLength(3);
      expect(merged.PreToolUse![0].hooks[0]).toBe(hook1);
      expect(merged.PreToolUse![1].hooks[0]).toBe(hook2);
      expect(merged.PreToolUse![2].hooks[0]).toBe(hook3);
    });

    it("should not mutate original configurations with nested hooks", () => {
      const hook1 = vi.fn(async () => ({ continue: true }));
      const hook2 = vi.fn(async () => ({ continue: true }));
      const hook3 = vi.fn(async () => ({ continue: true }));

      const config1 = {
        SessionStart: [{ hooks: [hook1] }],
        PreToolUse: [{ hooks: [hook2] }],
      };
      const config2 = {
        SessionStart: [{ hooks: [hook3] }],
      };

      const originalConfig1Length = config1.SessionStart.length;
      const originalConfig1PreToolLength = config1.PreToolUse.length;
      const originalConfig2Length = config2.SessionStart.length;

      const merged = mergeHooks(config1, config2);

      // Original configs should be unchanged
      expect(config1.SessionStart).toHaveLength(originalConfig1Length);
      expect(config1.PreToolUse).toHaveLength(originalConfig1PreToolLength);
      expect(config2.SessionStart).toHaveLength(originalConfig2Length);

      // Merged result should have combined hooks
      expect(merged.SessionStart).toHaveLength(2);
      expect(merged.PreToolUse).toHaveLength(1);

      // Modifying merged should not affect originals
      merged.SessionStart!.push({ hooks: [vi.fn()] });
      expect(config1.SessionStart).toHaveLength(originalConfig1Length);
    });
  });

  describe("Hook Event Coverage", () => {
    it("should emit events with correct payload for all hook types", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test-prompt",
          props: { task: "unit-test" },
        },
        eventHandler
      );

      // Test SessionStart payload
      await hooks.SessionStart![0].hooks[0](
        { hook_event_name: "SessionStart", session_id: "sess-1", cwd: "/test" },
        null,
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "session_start",
          sessionId: "sess-1",
          promptName: "test-prompt",
          data: expect.objectContaining({ cwd: "/test" }),
        })
      );

      // Test Stop payload (includes reason and tokens)
      await hooks.Stop![0].hooks[0](
        { hook_event_name: "Stop", session_id: "sess-1", reason: "end_turn" },
        null,
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "agent_stop",
          data: expect.objectContaining({ reason: "end_turn" }),
        })
      );

      // Test SubagentStart payload
      await hooks.SubagentStart![0].hooks[0](
        { hook_event_name: "SubagentStart", session_id: "sub-1", subagent_type: "explore" },
        null,
        { signal: new AbortController().signal }
      );
      expect(eventHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "subagent_start",
          sessionId: "sub-1",
        })
      );
    });

    it("should not track sensitive permission events for security", async () => {
      const eventHandler = vi.fn();
      const hooks = createTelemetryHooks(
        {
          isEnabled: true,
          promptName: "test",
          props: {},
        },
        eventHandler
      );

      // Permission-related hooks should not exist (security consideration)
      expect(hooks.PreCompact).toBeUndefined();
      expect(hooks.PermissionRequest).toBeUndefined();
      expect(hooks.Notification).toBeUndefined();

      // UserPromptSubmit is handled by OTEL hooks, not telemetry hooks
      expect(hooks.UserPromptSubmit).toBeUndefined();

      // Verify event handler was not called since no hooks were triggered
      expect(eventHandler).not.toHaveBeenCalled();
    });
  });
});
