/**
 * Regression: the built CLI must actually RUN when invoked the way npm
 * invokes it — through a `node_modules/.bin` SYMLINK.
 *
 * v1.0.0 shipped an `isDirectlyInvoked()` guard that compared
 * `import.meta.url` against `pathToFileURL(process.argv[1])` without
 * realpath-ing either side. Through a bin symlink (or any symlinked path
 * segment, e.g. /tmp on macOS) the two never match, so `npm create
 * agentmark` exited 0 having printed nothing and written nothing — a
 * silent no-op of the primary onboarding command.
 *
 * These tests spawn the REAL build output (dist/index.js) as a child
 * process, both directly and through a symlink, in a temp dir whose
 * realpath differs from its nominal path on macOS.
 */

import { execFileSync } from "child_process";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

const DIST_BIN = path.resolve(__dirname, "../../dist/index.js");

// Windows: npm is npm.cmd and .bin entries are cmd shims (not symlinks);
// .cmd files must be spawned through a shell on current Node.
const IS_WIN = process.platform === "win32";
function execNpm(args: string[], opts: Parameters<typeof execFileSync>[2]) {
  return execFileSync(IS_WIN ? "npm.cmd" : "npm", args, {
    ...opts,
    shell: IS_WIN,
  });
}

let workDir: string;

beforeEach(() => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-agentmark-bin-"));
});

afterEach(() => {
  fs.removeSync(workDir);
});

function runBin(entryPath: string): string {
  // --path + --client make the run fully non-interactive (no prompts).
  return execFileSync(process.execPath, [entryPath, "--path", ".", "--client", "claude-code"], {
    cwd: workDir,
    encoding: "utf8",
    env: {
      ...process.env,
      AGENTMARK_SKIP_SKILL_INSTALL: "1",
      // Belt and suspenders for any prompt fallback paths
      CI: "true",
    },
    input: "",
    timeout: 60_000,
  });
}

describe("built bin invocation (the npm/npx path)", () => {
  it("runs main() when dist/index.js is invoked directly", () => {
    const output = runBin(DIST_BIN);

    expect(output).toContain("agentmark.json");
    expect(fs.existsSync(path.join(workDir, "agentmark.json"))).toBe(true);
    expect(fs.existsSync(path.join(workDir, "agentmark"))).toBe(true);
  }, 60_000);

  it("runs main() when invoked through a SYMLINK, like node_modules/.bin does", () => {
    // Recreate exactly what npm does: a .bin symlink pointing at the entry.
    const binDir = path.join(workDir, "node_modules", ".bin");
    fs.ensureDirSync(binDir);
    const symlink = path.join(binDir, "create-agentmark");
    fs.symlinkSync(DIST_BIN, symlink);

    const output = runBin(symlink);

    // The 1.0.0 bug: this invocation exited 0 with EMPTY output and no
    // files. Assert the inverse loudly.
    expect(output).toContain("agentmark.json");
    expect(fs.existsSync(path.join(workDir, "agentmark.json"))).toBe(true);
    expect(fs.existsSync(path.join(workDir, "agentmark"))).toBe(true);
  }, 60_000);

  it("never exits silently: even an aborted run prints something", () => {
    // The 1.0.0 failure mode was EXIT 0 WITH EMPTY OUTPUT. Whatever else
    // changes, an invocation with no args and no TTY must still say
    // something (the prompt or the abort message) — silence is the bug.
    const out = execFileSync(process.execPath, [DIST_BIN], {
      cwd: workDir,
      encoding: "utf8",
      env: { ...process.env, AGENTMARK_SKIP_SKILL_INSTALL: "1" },
      input: "",
      timeout: 60_000,
    });
    expect(out.trim().length).toBeGreaterThan(0);
  }, 60_000);

  it("works as the PACKED npm artifact installed into node_modules (the real npx path)", () => {
    // Strongest ring: `npm pack` the package, install the tarball into a
    // scratch project, and run the bin via node_modules/.bin — byte-for-byte
    // what `npm create agentmark` executes. Catches packaging regressions
    // (files field, bin mapping) that source-level tests cannot see.
    const pkgRoot = path.resolve(__dirname, "../..");
    const packDir = fs.mkdtempSync(path.join(os.tmpdir(), "create-agentmark-pack-"));
    try {
      const tarball = (execNpm(["pack", pkgRoot, "--pack-destination", packDir], {
        encoding: "utf8",
        timeout: 120_000,
      }) as string)
        .trim()
        .split("\n")
        .pop()!;
      execNpm(
        ["install", "--no-save", "--no-audit", "--no-fund", path.join(packDir, tarball)],
        { cwd: workDir, encoding: "utf8", timeout: 120_000 },
      );

      const bin = path.join(
        workDir,
        "node_modules",
        ".bin",
        IS_WIN ? "create-agentmark.cmd" : "create-agentmark",
      );
      const scaffoldDir = path.join(workDir, "app");
      fs.ensureDirSync(scaffoldDir);
      const output = execFileSync(bin, ["--path", ".", "--client", "claude-code"], {
        shell: IS_WIN,
        cwd: scaffoldDir,
        encoding: "utf8",
        env: { ...process.env, AGENTMARK_SKIP_SKILL_INSTALL: "1" },
        input: "",
        timeout: 120_000,
      });

      // Full output contract of the happy path
      expect(output).toContain("agentmark.json");
      expect(output).toContain("AgentMark is wired up");
      const json = fs.readJsonSync(path.join(scaffoldDir, "agentmark.json"));
      expect(json.version).toBe("2.0.0");
      expect(json.agentmarkPath).toBe(".");
      const mcp = fs.readJsonSync(path.join(scaffoldDir, ".mcp.json"));
      expect(Object.keys(mcp.mcpServers)).toEqual(
        expect.arrayContaining(["agentmark-docs", "agentmark"]),
      );
      expect(fs.existsSync(path.join(scaffoldDir, "agentmark", ".gitkeep"))).toBe(true);
    } finally {
      fs.removeSync(packDir);
    }
    // npm pack + a cold-cache tarball install routinely exceed the 5s
    // default — this timeout is the TEST's; child processes have their own.
  }, 300_000);
});
