import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs-extra";
import path from "path";
import os from "os";

/**
 * Smoke tests for `runInit` — the `agentmark init` flow — driven directly
 * through its args object (no argv/commander layer). `installAgentmarkSkill`
 * self-skips under VITEST, and `child_process` is mocked so `initGitRepo`
 * never shells out to real git.
 */

vi.mock("child_process", () => ({
  execSync: () => {},
  execFileSync: () => {},
}));

import runInit from "../../cli-src/commands/init";

const CLI_VERSION = "9.9.9";

describe("runInit — minimal init", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-init-"));
  });

  afterEach(() => {
    fs.removeSync(tempDir);
  });

  it("writes agentmark.json with the canonical default shape", async () => {
    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    const config = fs.readJsonSync(path.join(tempDir, "agentmark.json"));
    expect(config).toEqual({
      $schema:
        "https://raw.githubusercontent.com/agentmark-ai/agentmark/refs/heads/main/packages/cli/agentmark.schema.json",
      version: "2.0.0",
      mdxVersion: "1.0",
      agentmarkPath: ".",
      // Empty by design — the provider is unknown at init time, so init no
      // longer presumes one; `pull-models` populates this during integration.
      builtInModels: [],
    });
  });

  it("creates an empty agentmark/ directory with a .gitkeep", async () => {
    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    const agentmarkDir = path.join(tempDir, "agentmark");
    expect(fs.existsSync(agentmarkDir)).toBe(true);
    expect(fs.statSync(agentmarkDir).isDirectory()).toBe(true);
    expect(fs.readdirSync(agentmarkDir)).toEqual([".gitkeep"]);
  });

  it("scaffolds the provider-agnostic client (greenfield → TypeScript) with the correct import", async () => {
    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    const clientPath = path.join(tempDir, "agentmark.client.ts");
    expect(fs.existsSync(clientPath)).toBe(true);
    // The bug this prevents: ApiLoader must come from the /loader-api subpath.
    expect(fs.readFileSync(clientPath, "utf8")).toContain(
      'import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";',
    );
    // dev-entry/handler are SDK-specific and stay agent-authored — not scaffolded.
    expect(fs.existsSync(path.join(tempDir, "dev-entry.ts"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, "handler.ts"))).toBe(false);
  });

  it("writes one MCP config per selected client", async () => {
    await runInit({
      path: tempDir,
      clients: ["claude-code", "codex", "cursor", "vscode", "zed"],
      overwrite: true,
      cliVersion: CLI_VERSION,
    });

    expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true); // claude-code
    expect(fs.existsSync(path.join(tempDir, ".codex/config.toml"))).toBe(true); // codex
    expect(fs.existsSync(path.join(tempDir, ".cursor/mcp.json"))).toBe(true); // cursor
    expect(fs.existsSync(path.join(tempDir, ".vscode/mcp.json"))).toBe(true); // vscode
    expect(fs.existsSync(path.join(tempDir, ".zed/settings.json"))).toBe(true); // zed
  });

  it("writes only the MCP config for the single client passed", async () => {
    await runInit({ path: tempDir, clients: ["cursor"], overwrite: true, cliVersion: CLI_VERSION });

    expect(fs.existsSync(path.join(tempDir, ".cursor/mcp.json"))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".vscode"))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, ".zed"))).toBe(false);
  });

  it("pins @agentmark-ai/cli + scripts into an existing package.json", async () => {
    // Existing project: package.json present → init pins the CLI locally so
    // `npm run dev` uses the pinned binary in CI without a global install.
    fs.writeJsonSync(path.join(tempDir, "package.json"), {
      name: "host-app",
      scripts: { dev: "next dev" },
    });

    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    const pkg = fs.readJsonSync(path.join(tempDir, "package.json"));
    expect(pkg.devDependencies["@agentmark-ai/cli"]).toBe(`^${CLI_VERSION}`);
    // Host's `dev` untouched; AgentMark's lands under the namespaced fallback.
    expect(pkg.scripts.dev).toBe("next dev");
    expect(pkg.scripts["agentmark:dev"]).toBe("agentmark dev");
  });

  it("does NOT create a package.json on a greenfield init (nothing to pin into)", async () => {
    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    expect(fs.existsSync(path.join(tempDir, "package.json"))).toBe(false);
  });

  it("respects --overwrite when agentmark.json already exists", async () => {
    fs.writeJsonSync(path.join(tempDir, "agentmark.json"), { custom: "pre-existing" });

    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    const config = fs.readJsonSync(path.join(tempDir, "agentmark.json"));
    expect(config.version).toBe("2.0.0");
    expect(config).not.toHaveProperty("custom");
  });

  it("preserves an existing agentmark/ directory and its contents", async () => {
    const existingPromptPath = path.join(tempDir, "agentmark", "my-existing.prompt.mdx");
    fs.ensureDirSync(path.join(tempDir, "agentmark"));
    fs.writeFileSync(existingPromptPath, "---\nname: existing\n---\n");

    await runInit({ path: tempDir, clients: ["claude-code"], overwrite: true, cliVersion: CLI_VERSION });

    expect(fs.readFileSync(existingPromptPath, "utf-8")).toBe("---\nname: existing\n---\n");
    // .gitkeep NOT added — folder isn't empty
    expect(fs.existsSync(path.join(tempDir, "agentmark", ".gitkeep"))).toBe(false);
  });

  it("keeps an existing agentmark.json when overwrite is absent under --yes", async () => {
    const custom = { version: "2.0.0", mdxVersion: "1.0", agentmarkPath: ".", custom: "value" };
    fs.writeJsonSync(path.join(tempDir, "agentmark.json"), custom);

    await runInit({ path: tempDir, clients: ["claude-code"], yes: true, cliVersion: CLI_VERSION });

    // Under --yes the safe default is "keep existing" — no clobber.
    expect(fs.readJsonSync(path.join(tempDir, "agentmark.json"))).toEqual(custom);
    expect(fs.existsSync(path.join(tempDir, ".mcp.json"))).toBe(true);
  });
});
