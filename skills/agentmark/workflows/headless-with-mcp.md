# Headless: drive AgentMark Cloud with the MCP server

When an agent (Claude Code, Cursor, VS Code, ChatGPT desktop, etc.) needs to create apps, mint API keys, connect a git provider, query traces, or any other Cloud API operation **without** the user clicking through the dashboard, run the **AgentMark MCP server** alongside the IDE.

The MCP server (`@agentmark-ai/mcp-server`, binary `agentmark-mcp`) does three things:

1. **Loads local trace-debugging tools** (`list_traces`, `get_trace`) for inspecting traces from a `agentmark dev` session.
2. **Fetches the gateway's OpenAPI spec** at startup and registers one MCP tool per operation. Tool names are the operation IDs in snake_case (e.g. `create_app`, `start_app_git_connect`, `list_experiments`, `get_metrics`). The set is auto-generated and stays in lock-step with the gateway — when the gateway ships a new endpoint, the MCP tools pick it up on next restart.
3. **Authenticates** with whichever credential resolves first: `AGENTMARK_API_KEY` env (CI, automation), then session bearer from `~/.agentmark/auth.json` (a developer's laptop after `agentmark login`).

## Installation

```bash
# global (any client can spawn it)
npm install -g @agentmark-ai/mcp-server

# or via the published bin without a global install
npx -y -p @agentmark-ai/mcp-server agentmark-mcp
```

Verify:

```bash
agentmark-mcp --help   # exits cleanly; the server otherwise waits for MCP stdio frames
```

## Client config

The MCP server speaks stdio JSON-RPC, the standard MCP transport. Every major MCP client uses the same config shape — just a different path. Add this block to your client's mcp config file:

```jsonc
{
  "mcpServers": {
    "agentmark": {
      "command": "agentmark-mcp",
      "env": {
        // Optional. Defaults to https://api.agentmark.co.
        // Point at staging or a local gateway during development.
        "AGENTMARK_API_URL": "https://api.agentmark.co"
      }
    }
  }
}
```

Client paths:

| Client | Config file |
|---|---|
| Claude Code | `~/.config/claude-code/mcp.json` (or workspace `.mcp.json`) |
| Cursor | `~/.cursor/mcp.json` (or workspace `.cursor/mcp.json`) |
| VS Code (Copilot Chat) | `.vscode/mcp.json` |
| Claude.ai desktop | App → Settings → MCP servers |

After saving, restart the MCP client. You should see the AgentMark tools listed (look for `create_app`, `list_apps`, `start_app_git_connect`, etc.).

## Authentication

Two sources, checked in this order:

1. **`AGENTMARK_API_KEY` env var** — long-lived API key minted in the dashboard (Settings → API keys). The right choice for CI / agent infrastructure / shared dev boxes. Recommended pattern: put it in the same `env` block as `AGENTMARK_API_URL`.
2. **Session bearer in `~/.agentmark/auth.json`** — written by `agentmark login`. The right choice on a developer's personal machine; the MCP server uses the same identity as your CLI.

If **neither** resolves, the MCP server still starts but only the local trace-debugging tools are registered. Cloud tools are silently omitted. The client's tool list shows you what's available — if `create_app` and friends are missing, you need to run `agentmark login` (then restart the MCP client to re-read the file) or set `AGENTMARK_API_KEY`.

Tokens are **not refreshed** by the MCP server. If a session JWT expires mid-session, calls start returning 401. Re-run `agentmark login` and restart the MCP client. (We deliberately keep refresh in the CLI; it owns the Supabase OAuth state machine.)

## The headless flow, end to end

The motivating use case is "user types one sentence to their IDE agent, project is provisioned, traces start flowing." With the MCP server in place, that flow is purely tool calls:

```
user → "set up a new agentmark app and connect it to my github"
agent (via MCP):
  1. create_app({ name: "my-app", description: "..." })
     → { data: { id: "<APP_ID>", … } }
  2. start_app_git_connect({ appId: "<APP_ID>", provider: "github" })
     → { data: { authorization_url: "https://github.com/apps/agentmark/...", state: "..." } }
  3. Agent prints the URL; user clicks once to authorize on GitHub.
  4. Agent polls get_app_git_connection({ appId }) until status === "connected".
  5. Agent writes agentmark.json + a starter prompt locally, runs `agentmark dev`,
     and traces start showing up in get_metrics / list_traces.
```

No manual dashboard clicks except the GitHub authorization (which requires the user to be the authority on what repos to expose).

**You never pass `tenant_id`.** Every tenant-scoped write (`create_app` and friends) is scoped to your authenticated tenant at the database layer — a `tenant_id` in a request body is silently ignored (forgery-proof by design, and it isn't in the request schemas). If a resource turns up under an unexpected tenant, the cause is the API key / session you authenticated with, not a missing field.

## Tool reference

The full tool list comes from the gateway. To see what's registered at any moment:

```bash
# verbose: prints the full inventory + skips/warnings on startup
AGENTMARK_API_URL=https://api.agentmark.co agentmark-mcp 2>&1 | head -3
# → [agentmark-mcp] Registered N Cloud tools from https://api.agentmark.co/v1/openapi.json
```

Or send `tools/list` via the MCP client — **that is the authoritative set**, since tools are generated from your gateway's `openapi.json`. The count and available resources depend on the gateway version + environment: the current prod gateway (`api.agentmark.co`) exposes **~43 tools** (datasets, experiments, scores, traces, spans, sessions, metrics, alerts, annotation queues, pricing, capabilities). **App / deployment / API-key management tools (`create_app`, `list_deployments`, `create_api_key`, git-connect, …) are not on prod yet — they're on staging (`api-stg.agentmark.co`).** Trust `tools/list` over any static list here.

### Argument shape

For each tool, **path parameters, query parameters, and request-body fields are flattened into a single input object**. An agent calling `start_app_git_connect` passes `{ appId, provider, return_to? }` directly, not `{ path: { appId }, body: { provider, return_to } }`. This matches Stripe's Agent Toolkit and specli's flattening — it's the ergonomically right shape for LLM tool-calling.

Required fields are enforced by Zod schemas derived from the OpenAPI spec. The MCP client surfaces these schemas to the LLM so it knows what to pass.

### Response shape

The MCP server passes the gateway response through verbatim. The gateway uses a consistent `{ data: <result> }` envelope on success and a `{ error: { code, message, ... } }` shape on failure. LLM consumers navigate this naturally; SDK consumers (in a future world) would unwrap.

Non-2xx responses become MCP `isError: true` blocks with the HTTP status and gateway error body inlined as text — the LLM sees `"HTTP 400 Bad Request: name is required"`, not a silent empty response.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Cloud tools missing from the MCP client's tool list | No bearer resolved | Run `agentmark login` (then restart the MCP client) or set `AGENTMARK_API_KEY`. |
| Cloud tools listed but all calls return 401 | Token expired | Re-run `agentmark login` and restart the MCP client. |
| Cloud tools registered but pointing at wrong env | `AGENTMARK_API_URL` not set in MCP client's `env` block | Edit the client config, restart. |
| `tools/list` is empty | MCP server didn't start | Check the client's MCP server logs (stderr). The first thing the server prints is the auth resolution + tool count. |
| New gateway endpoint not showing as a tool | OpenAPI spec cache (24h) | Delete `~/.agentmark/mcp-openapi-cache.json` and restart the MCP client to refetch. |

## When NOT to use the MCP server

- **Custom CI scripts that need scripted output.** MCP is conversational. For "create app X, capture its ID, write it to env" CI pipelines, call the gateway REST endpoints directly with `curl` / a thin SDK — same auth, no MCP client required.
- **Bulk data movement.** For migrations or backfills (thousands of items), use the gateway's bulk endpoints directly. The MCP server isn't optimized for high-throughput sequential calls; each tool call is a round-trip from the IDE.
- **Anywhere the `agentmark` CLI already has a typed command** (e.g. `agentmark login`, `agentmark dev`, `agentmark link`, `agentmark run-experiment`). The CLI commands have hand-curated UX (project detection, interactive prompts, structured output) that's better for humans than raw API calls.

## Why MCP and not something custom

MCP became the de facto agent-IDE protocol in 2025: Anthropic, OpenAI (ChatGPT desktop), Microsoft (VS Code Copilot), Cursor, Zed, Continue, and most other major IDEs all consume it. Vendors building agent-oriented developer tools (Stripe, Cloudflare, GitHub, Linear, Notion, Sentry, …) ship MCP servers as their primary headless surface in addition to traditional REST. AgentMark follows the same pattern.

The choice is not "MCP vs REST" but "MCP **and** REST" — REST is the source of truth, MCP is a generated agent-friendly wrapper. The OpenAPI spec at `api.agentmark.co/v1/openapi.json` is the single source. The MCP server generates tools from it at startup; CI scripts call REST directly; future SDKs will be code-generated from the same spec. Single source, multiple surfaces, zero hand-rolled drift.
