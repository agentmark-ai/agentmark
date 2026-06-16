/**
 * Shared MCP-config builder for `agentmark init`.
 *
 * Writes the project-local IDE config (mcp.json / settings.json) for
 * the four supported clients. Every scaffolded project gets THREE
 * MCP servers wired up by default:
 *
 *   1. `agentmark-docs` (remote HTTP) — read-only docs / reference,
 *      hosted at `https://docs.agentmark.co/mcp`.
 *
 *   2. `agentmark` (stdio, `@agentmark-ai/mcp-server`) — AgentMark
 *      Cloud surface. Defaults to `https://api.agentmark.co`; pass a
 *      custom URL via `customApiUrl` (the undocumented `--api-url`
 *      flag on the CLI) to point at a non-prod gateway (staging,
 *      self-hosted).
 *
 *   3. `agentmark-local` (stdio, `@agentmark-ai/mcp-server`) — the
 *      same MCP binary, pointed at the local `agentmark dev` server
 *      (`http://localhost:9418`). The local dev server serves the
 *      same OpenAPI contract under `/v1/openapi.json`, so the same
 *      tool surface (`list_traces`, `get_trace`, …) is available
 *      against local SQLite traces.
 *
 * Why both `agentmark` and `agentmark-local`: workflows like "pull
 * failing traces from AgentMark Cloud, fix locally, re-verify against
 * `agentmark dev` traces" need BOTH endpoints reachable in the same
 * conversation. MCP clients namespace tools by server name, so the
 * agent calls `agentmark/list_traces` for cloud and
 * `agentmark-local/list_traces` for local — same tool, explicit
 * destination.
 *
 * Auth chain is endpoint-agnostic:
 *
 *   - `AGENTMARK_API_KEY` env (CI / dedicated agents) wins
 *   - falls back to `~/.agentmark/auth.json` from
 *     `agentmark login [--base-url <matching-endpoint>]`
 *   - local dev calls are unauthenticated by design (the local dev
 *     server doesn't validate auth headers)
 *
 * Shell `export AGENTMARK_API_URL=…` still wins at runtime when the
 * IDE inherits the shell — what we write here is the default for
 * cold-launched IDEs.
 */

import fs from "fs-extra";
import * as path from "path";

export type McpClient = "vscode" | "zed" | "cursor" | "claude-code" | "codex" | "skip";

/** URL the cloud-pointing `agentmark` MCP entry talks to by default. */
const CLOUD_API_URL = "https://api.agentmark.co";

/** Local `agentmark dev` server URL — matches AGENTMARK_PORT default. */
const LOCAL_DEV_URL = "http://localhost:9418";

/** The npm package id of the stdio MCP server (used for both entries). */
const MCP_SERVER_PACKAGE = "@agentmark-ai/mcp-server";

/** Docs MCP endpoint (remote HTTP, used across all clients). */
const DOCS_ENTRY_URL = "https://docs.agentmark.co/mcp";

interface StdioServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
  type?: "stdio";
}

interface RemoteServerEntry {
  url: string;
  type?: "http";
}

/**
 * Builds an stdio MCP server entry pointed at the given URL.
 *
 *   - When the URL matches the MCP server's built-in default
 *     (`https://api.agentmark.co`), the `env` block is omitted so a
 *     future change to that default cleanly propagates to existing
 *     scaffolded projects.
 *   - For any other URL (custom `--api-url`, or the local dev URL),
 *     we write `env: { AGENTMARK_API_URL: <url> }` explicitly.
 */
function stdioEntry(apiUrl: string, includeType: boolean): StdioServerEntry {
  const entry: StdioServerEntry = {
    command: "npx",
    args: ["-y", MCP_SERVER_PACKAGE],
  };
  if (apiUrl !== CLOUD_API_URL) {
    entry.env = { AGENTMARK_API_URL: apiUrl };
  }
  if (includeType) entry.type = "stdio";
  return entry;
}

interface WriteResult {
  /** Absolute or relative path to the file that was written. */
  configPath: string;
}

export interface WriteMcpConfigOptions {
  /**
   * Arbitrary AgentMark gateway URL for the cloud-side `agentmark` MCP
   * entry. Defaults to `https://api.agentmark.co`. Escape hatch for
   * internal AgentMark engineers (staging) and self-hosters — NOT a
   * customer-facing option.
   */
  customApiUrl?: string;
}

/**
 * Writes the IDE-specific MCP config file with three servers wired up.
 * Idempotent: caller passes a fresh target dir per scaffold.
 */
export function writeMcpConfig(
  client: McpClient,
  targetPath: string,
  opts: WriteMcpConfigOptions = {},
): WriteResult | null {
  if (client === "skip") return null;

  const cloudUrl = opts.customApiUrl ?? CLOUD_API_URL;
  const docsEntry: RemoteServerEntry = { url: "https://docs.agentmark.co/mcp" };

  if (client === "vscode") {
    const vscodeDir = path.join(targetPath, ".vscode");
    fs.ensureDirSync(vscodeDir);
    const configPath = path.join(vscodeDir, "mcp.json");
    const config = {
      servers: {
        "agentmark-docs": docsEntry,
        "agentmark": stdioEntry(cloudUrl, /* includeType */ false),
        "agentmark-local": stdioEntry(LOCAL_DEV_URL, /* includeType */ false),
      },
    };
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    return { configPath };
  }

  if (client === "zed") {
    const zedDir = path.join(targetPath, ".zed");
    fs.ensureDirSync(zedDir);
    const configPath = path.join(zedDir, "settings.json");
    const config = {
      context_servers: {
        "agentmark-docs": docsEntry,
        "agentmark": stdioEntry(cloudUrl, /* includeType */ false),
        "agentmark-local": stdioEntry(LOCAL_DEV_URL, /* includeType */ false),
      },
    };
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    return { configPath };
  }

  if (client === "cursor") {
    const cursorDir = path.join(targetPath, ".cursor");
    fs.ensureDirSync(cursorDir);
    const configPath = path.join(cursorDir, "mcp.json");
    const config = {
      mcpServers: {
        "agentmark-docs": docsEntry,
        "agentmark": stdioEntry(cloudUrl, /* includeType */ false),
        "agentmark-local": stdioEntry(LOCAL_DEV_URL, /* includeType */ false),
      },
    };
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    return { configPath };
  }

  if (client === "claude-code") {
    const configPath = path.join(targetPath, ".mcp.json");
    const config = {
      mcpServers: {
        "agentmark-docs": { type: "http" as const, ...docsEntry },
        "agentmark": stdioEntry(cloudUrl, /* includeType */ true),
        "agentmark-local": stdioEntry(LOCAL_DEV_URL, /* includeType */ true),
      },
    };
    fs.writeJsonSync(configPath, config, { spaces: 2 });
    return { configPath };
  }

  if (client === "codex") {
    const codexDir = path.join(targetPath, ".codex");
    fs.ensureDirSync(codexDir);
    const configPath = path.join(codexDir, "config.toml");
    // Codex uses TOML with an untagged transport enum: presence of `url`
    // selects StreamableHttp; presence of `command` selects Stdio. No
    // explicit `type` field is written.
    const cloudEnv = cloudUrl !== CLOUD_API_URL
      ? `\nenv = { AGENTMARK_API_URL = "${cloudUrl}" }`
      : "";
    const toml = [
      "# AgentMark MCP servers — managed by agentmark init",
      "[mcp_servers.agentmark-docs]",
      `url = "${DOCS_ENTRY_URL}"`,
      "",
      "[mcp_servers.agentmark]",
      `command = "npx"`,
      `args = ["-y", "${MCP_SERVER_PACKAGE}"]${cloudEnv}`,
      "",
      "[mcp_servers.agentmark-local]",
      `command = "npx"`,
      `args = ["-y", "${MCP_SERVER_PACKAGE}"]`,
      `env = { AGENTMARK_API_URL = "${LOCAL_DEV_URL}" }`,
      "",
    ].join("\n");
    fs.writeFileSync(configPath, toml, "utf8");
    return { configPath };
  }

  return null;
}
