import { describe, it, expect, vi } from "vitest";
import { run } from "../src/index";

/**
 * create-agentmark is a thin wrapper over `agentmark init`. Its whole
 * contract is: invoke the CLI via `npx -y @agentmark-ai/cli init
 * <forwarded args>` (which reuses an installed CLI or fetches it on demand,
 * so this package needs no dependency on the CLI) and propagate the exit
 * code.
 *
 * These tests inject a fake `spawn` so they assert the exact delegation
 * without launching a real process or hitting the network. The scaffold
 * behavior itself is covered by the CLI's own test/init/* suites —
 * duplicating it here would test the wrong package.
 */
describe("create-agentmark wrapper", () => {
  it("invokes `npx -y @agentmark-ai/cli init` with no extra args when none are passed", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const code = run([], { spawn });

    expect(code).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith("npx", ["-y", "@agentmark-ai/cli", "init"]);
  });

  it("forwards every argument verbatim, in order, after `init`", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    run(["my-app", "--client", "all", "--yes"], { spawn });

    expect(spawn).toHaveBeenCalledWith("npx", [
      "-y",
      "@agentmark-ai/cli",
      "init",
      "my-app",
      "--client",
      "all",
      "--yes",
    ]);
  });

  it("propagates the child's non-zero exit code", () => {
    const spawn = vi.fn(() => ({ status: 7 }));
    expect(run(["--bad"], { spawn })).toBe(7);
  });

  it("returns 1 when the child reports no status (signal kill)", () => {
    const spawn = vi.fn(() => ({ status: null }));
    expect(run([], { spawn })).toBe(1);
  });

  it("returns 1 and logs an install hint when npx itself can't be launched", () => {
    const spawn = vi.fn(() => ({ status: null, error: new Error("spawn npx ENOENT") }));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const code = run([], { spawn });

    expect(code).toBe(1);
    expect(errSpy).toHaveBeenCalledWith(
      expect.stringContaining("npm install -g @agentmark-ai/cli"),
    );
    errSpy.mockRestore();
  });
});
