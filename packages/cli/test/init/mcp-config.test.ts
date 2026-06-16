import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "fs-extra";
import os from "os";
import path from "path";
import { writeMcpConfig } from "../../cli-src/commands/init/mcp-config";

/**
 * Each test creates a fresh temp dir so writes don't collide across
 * cases. We assert on the parsed JSON, not the on-disk bytes —
 * formatting changes (key order, indentation tweaks) shouldn't fail
 * these tests.
 *
 * Behavior pinned here:
 *
 * - Every scaffolded project gets THREE servers:
 *     `agentmark-docs`        (remote http — docs)
 *     `agentmark`             (stdio — cloud)
 *     `agentmark-local`       (stdio — local `agentmark dev` server)
 *   The `agentmark-local` entry is what makes workflows like "pull
 *   failing traces from cloud, fix locally, re-verify locally" work
 *   without manual mcp.json editing — MCP clients namespace tools by
 *   server name, so the agent has `agentmark/list_traces` and
 *   `agentmark-local/list_traces` available in the same conversation.
 *
 * - `customApiUrl` only swaps the cloud-side `agentmark` entry's
 *   target. `agentmark-local` always points at `http://localhost:9418`
 *   (the AGENTMARK_PORT default of `agentmark dev`). Internal devs
 *   pointing `agentmark` at staging still have a working local entry.
 *
 * - The prod URL (`https://api.agentmark.co`) is OMITTED from the
 *   `env` block of the cloud entry so the MCP server's own default
 *   takes effect. If we ever move the prod gateway, scaffolded
 *   projects pick up the change automatically.
 */

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentmark-mcp-config-"));
}

describe("writeMcpConfig", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTempDir();
  });

  afterEach(() => {
    fs.removeSync(tmp);
  });

  describe("skip client", () => {
    it("returns null and writes nothing", () => {
      const result = writeMcpConfig("skip", tmp);
      expect(result).toBeNull();
      expect(fs.readdirSync(tmp)).toEqual([]);
    });
  });

  describe("VS Code", () => {
    it("writes .vscode/mcp.json with docs + cloud + local stdio entries", () => {
      const result = writeMcpConfig("vscode", tmp);
      expect(result?.configPath).toBe(path.join(tmp, ".vscode", "mcp.json"));
      const written = fs.readJsonSync(path.join(tmp, ".vscode", "mcp.json"));
      expect(written).toEqual({
        servers: {
          "agentmark-docs": { url: "https://docs.agentmark.co/mcp" },
          "agentmark": {
            command: "npx",
            args: ["-y", "@agentmark-ai/mcp-server"],
          },
          "agentmark-local": {
            command: "npx",
            args: ["-y", "@agentmark-ai/mcp-server"],
            env: { AGENTMARK_API_URL: "http://localhost:9418" },
          },
        },
      });
    });
  });

  describe("Zed", () => {
    it("writes .zed/settings.json under context_servers with docs + cloud + local entries", () => {
      writeMcpConfig("zed", tmp);
      const written = fs.readJsonSync(path.join(tmp, ".zed", "settings.json"));
      expect(written.context_servers["agentmark-local"].env.AGENTMARK_API_URL).toBe(
        "http://localhost:9418",
      );
      expect(Object.keys(written.context_servers).sort()).toEqual([
        "agentmark",
        "agentmark-docs",
        "agentmark-local",
      ]);
    });
  });

  describe("Cursor", () => {
    it("writes .cursor/mcp.json under mcpServers with docs + cloud + local entries", () => {
      writeMcpConfig("cursor", tmp);
      const written = fs.readJsonSync(path.join(tmp, ".cursor", "mcp.json"));
      expect(written.mcpServers["agentmark-local"].env.AGENTMARK_API_URL).toBe(
        "http://localhost:9418",
      );
      expect(Object.keys(written.mcpServers).sort()).toEqual([
        "agentmark",
        "agentmark-docs",
        "agentmark-local",
      ]);
    });
  });

  describe("Claude Code", () => {
    it("writes .mcp.json with explicit type fields (http for docs, stdio for both agentmark entries)", () => {
      // Claude Code's mcp.json requires `type` on each entry. The other
      // three IDEs infer transport from the presence of `url` vs
      // `command`. Both shapes must be written correctly or Claude
      // Code silently refuses to load the server.
      writeMcpConfig("claude-code", tmp);
      const written = fs.readJsonSync(path.join(tmp, ".mcp.json"));
      expect(written).toEqual({
        mcpServers: {
          "agentmark-docs": {
            type: "http",
            url: "https://docs.agentmark.co/mcp",
          },
          "agentmark": {
            type: "stdio",
            command: "npx",
            args: ["-y", "@agentmark-ai/mcp-server"],
          },
          "agentmark-local": {
            type: "stdio",
            command: "npx",
            args: ["-y", "@agentmark-ai/mcp-server"],
            env: { AGENTMARK_API_URL: "http://localhost:9418" },
          },
        },
      });
    });
  });

  describe("cloud-side URL resolution", () => {
    it("prod default omits the env block on the cloud `agentmark` entry", () => {
      // Why this matters: writing `env: { AGENTMARK_API_URL:
      // "https://api.agentmark.co" }` would lock new customers into a
      // literal URL — if we ever move the prod gateway, every
      // existing scaffolded project breaks. Omission lets the MCP
      // server's built-in default propagate.
      writeMcpConfig("vscode", tmp);
      const written = fs.readJsonSync(path.join(tmp, ".vscode", "mcp.json"));
      expect(written.servers.agentmark.env).toBeUndefined();
    });

    it("customApiUrl writes that URL verbatim into the cloud entry's env block", () => {
      writeMcpConfig("vscode", tmp, {
        customApiUrl: "https://api-stg.agentmark.co",
      });
      const written = fs.readJsonSync(path.join(tmp, ".vscode", "mcp.json"));
      expect(written.servers.agentmark.env).toEqual({
        AGENTMARK_API_URL: "https://api-stg.agentmark.co",
      });
      // The local entry is INDEPENDENT of customApiUrl — staging users
      // still get a working local entry pointing at port 9418.
      expect(written.servers["agentmark-local"].env).toEqual({
        AGENTMARK_API_URL: "http://localhost:9418",
      });
    });
  });

  describe("npx package id", () => {
    it("references @agentmark-ai/mcp-server in BOTH stdio entries (no version pin, no fork)", () => {
      // Why this matters: both `agentmark` and `agentmark-local` use
      // the same MCP binary — they differ only in env. Typos in either
      // entry would break headless flows silently.
      writeMcpConfig("vscode", tmp);
      const written = fs.readJsonSync(path.join(tmp, ".vscode", "mcp.json"));
      expect(written.servers.agentmark.args).toEqual(["-y", "@agentmark-ai/mcp-server"]);
      expect(written.servers["agentmark-local"].args).toEqual(["-y", "@agentmark-ai/mcp-server"]);
    });
  });

  describe("Codex", () => {
    it("writes .codex/config.toml with docs (HTTP) + cloud + local stdio entries", () => {
      const result = writeMcpConfig("codex", tmp);
      expect(result?.configPath).toBe(path.join(tmp, ".codex", "config.toml"));
      const toml = fs.readFileSync(path.join(tmp, ".codex", "config.toml"), "utf8");
      // HTTP docs entry — url only, no command (untagged enum: url → StreamableHttp)
      expect(toml).toContain('[mcp_servers.agentmark-docs]');
      expect(toml).toContain('url = "https://docs.agentmark.co/mcp"');
      expect(toml).not.toMatch(/\[mcp_servers\.agentmark-docs\][^[]*command/s);
      // Cloud stdio entry — no env block for prod URL
      expect(toml).toContain('[mcp_servers.agentmark]');
      expect(toml).toContain('command = "npx"');
      expect(toml).toContain('args = ["-y", "@agentmark-ai/mcp-server"]');
      // Local stdio entry — always has env block
      expect(toml).toContain('[mcp_servers.agentmark-local]');
      expect(toml).toContain('AGENTMARK_API_URL = "http://localhost:9418"');
    });

    it("omits env block on the cloud entry when using prod URL", () => {
      writeMcpConfig("codex", tmp);
      const toml = fs.readFileSync(path.join(tmp, ".codex", "config.toml"), "utf8");
      // The agentmark (cloud) section should not reference api.agentmark.co
      const cloudSection = toml.split("[mcp_servers.agentmark-local]")[0]!
        .split("[mcp_servers.agentmark]")[1] ?? "";
      expect(cloudSection).not.toContain("AGENTMARK_API_URL");
    });

    it("writes env block on cloud entry for a custom API URL", () => {
      writeMcpConfig("codex", tmp, { customApiUrl: "https://api-stg.agentmark.co" });
      const toml = fs.readFileSync(path.join(tmp, ".codex", "config.toml"), "utf8");
      expect(toml).toContain('AGENTMARK_API_URL = "https://api-stg.agentmark.co"');
      // Local entry still points at localhost regardless of customApiUrl
      expect(toml).toContain('AGENTMARK_API_URL = "http://localhost:9418"');
    });
  });

  describe("file location parity with pre-change behavior", () => {
    it("each client still writes to its historical path", () => {
      const vscode = writeMcpConfig("vscode", tmp);
      const zed = writeMcpConfig("zed", tmp);
      const cursor = writeMcpConfig("cursor", tmp);
      const claude = writeMcpConfig("claude-code", tmp);
      const codex = writeMcpConfig("codex", tmp);

      expect(vscode?.configPath.endsWith(path.join(".vscode", "mcp.json"))).toBe(true);
      expect(zed?.configPath.endsWith(path.join(".zed", "settings.json"))).toBe(true);
      expect(cursor?.configPath.endsWith(path.join(".cursor", "mcp.json"))).toBe(true);
      expect(claude?.configPath.endsWith(path.sep + ".mcp.json")).toBe(true);
      expect(codex?.configPath.endsWith(path.join(".codex", "config.toml"))).toBe(true);
    });
  });
});
