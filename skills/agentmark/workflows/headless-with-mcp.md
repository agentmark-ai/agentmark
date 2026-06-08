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

> **The two credentials do not have the same authority.** An **API key is app-scoped** — it is bound to one app and carries only app-scoped permissions, so it **cannot create, update, or delete apps** (`create_app` / `update_app` / `delete_app`). Those operate at the tenant tier. A **session bearer is tenant-wide**, so it can provision and manage apps. Practical consequence: app management runs under `agentmark login` (a developer's laptop) or the dashboard — *not* under an `AGENTMARK_API_KEY`. An API key still does everything *within* its app (traces, scores, datasets, deployments, alerts, environments, minting more keys for that app).
>
> This is by design: a key minted "for app A" must not be able to delete sibling app B in the same tenant.

If **neither** resolves, the MCP server still starts but only the local trace-debugging tools are registered. Cloud tools are silently omitted. The client's tool list shows you what's available. App-management tools (`create_app`, `update_app`, `delete_app`) only appear under a session bearer — if they're missing, run `agentmark login` and restart the MCP client. App-scoped tools also need *some* credential — set `AGENTMARK_API_KEY` (with `AGENTMARK_APP_ID`) or log in.

Tokens are **not refreshed** by the MCP server — it doesn't run the Supabase OAuth state machine (the CLI owns that). But it **re-reads the credential from `~/.agentmark/auth.json` on every tool call**, so the recovery is just `agentmark login`: when a session JWT expires mid-session, calls start returning 401; have the user re-run `agentmark login`, and the **next** tool call picks up the fresh token automatically — no MCP-client restart needed. (Older mcp-server builds resolved auth once at startup and did need a restart; if re-login isn't taking effect, restart the client or use the REST fallback in [When NOT to use the MCP server](#when-not-to-use-the-mcp-server).) On a 401 caused by an expired session, the server appends an actionable hint to the error so the cause is obvious.

## The headless flow, end to end

The motivating use case is "user types one sentence to their IDE agent, project is provisioned, traces start flowing." With the MCP server in place, that flow is purely tool calls. Step 1 (`create_app`) is tenant-tier, so this flow requires **session-bearer auth** — the developer has run `agentmark login`. (A bare `AGENTMARK_API_KEY` can't create the app; see Authentication above.)

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

**You never pass `tenant_id`.** Every tenant-scoped write is scoped to your authenticated tenant at the database layer — a `tenant_id` in a request body is silently ignored (forgery-proof by design, and it isn't in the request schemas). If a resource turns up under an unexpected tenant, the cause is the session you authenticated with, not a missing field. (App provisioning specifically requires the session bearer — see Authentication.)

## Tool reference

The full tool list comes from the gateway. To see what's registered at any moment:

```bash
# verbose: prints the full inventory + skips/warnings on startup
AGENTMARK_API_URL=https://api.agentmark.co agentmark-mcp 2>&1 | head -3
# → [agentmark-mcp] Registered N Cloud tools from https://api.agentmark.co/v1/openapi.json
```

Or send `tools/list` via the MCP client — **that is the authoritative set**, since the tools are generated from your gateway's `openapi.json` at startup. The exact count and available resources depend on your gateway version, so trust `tools/list` over any static list here.

### Argument shape

For each tool, **path parameters, query parameters, and request-body fields are flattened into a single input object**. An agent calling `start_app_git_connect` passes `{ appId, provider, return_to? }` directly, not `{ path: { appId }, body: { provider, return_to } }`. This matches Stripe's Agent Toolkit's flattening — it's the ergonomically right shape for LLM tool-calling.

Required fields are enforced by Zod schemas derived from the OpenAPI spec. The MCP client surfaces these schemas to the LLM so it knows what to pass.

### Response shape

The MCP server passes the gateway response through verbatim. The gateway uses a consistent `{ data: <result> }` envelope on success and a `{ error: { code, message, ... } }` shape on failure. LLM consumers navigate this naturally; SDK consumers (in a future world) would unwrap.

Non-2xx responses become MCP `isError: true` blocks with the HTTP status and gateway error body inlined as text — the LLM sees `"HTTP 400 Bad Request: name is required"`, not a silent empty response.

## Failure modes

| Symptom | Diagnosis | Fix |
|---|---|---|
| Cloud tools missing from the MCP client's tool list | No bearer resolved | Run `agentmark login` (then restart the MCP client) or set `AGENTMARK_API_KEY`. |
| Cloud tools listed but all calls return 401 | Session token expired. Recent mcp-server builds append a "session expired — run `agentmark login`" hint to the 401; if you instead see a bare `"Missing auth header"` (the client dropped the expired token) check `expires_at` in `~/.agentmark/auth.json` against the clock. | Have the user re-run `agentmark login` — the **next** tool call picks up the fresh token automatically (the server re-reads auth.json per call), **no MCP-client restart needed**. On an older mcp-server that resolved auth once at startup, restart the client, or use the REST fallback below (call the gateway directly with the new bearer from `~/.agentmark/auth.json`). |
| Cloud tools registered but pointing at wrong env | `AGENTMARK_API_URL` not set in MCP client's `env` block | Edit the client config, restart. |
| `tools/list` is empty | MCP server didn't start | Check the client's MCP server logs (stderr). The first thing the server prints is the auth resolution + tool count. |
| New gateway endpoint not showing as a tool | OpenAPI spec cache (24h) | Delete `~/.agentmark/mcp-openapi-cache.json` and restart the MCP client to refetch. |
| `mint_api_key` / `POST /v1/api-keys` returns `api_key_creation_failed — "API key service is not configured"` | **Server-side configuration gap** — the gateway deployment is missing its key-provisioning (Unkey) config. Your request shape and auth are fine; this error isn't in the endpoint's documented 400/401/402 responses, and retrying or changing headers won't help. | Not agent-recoverable. Have the user mint the key in the dashboard (app Settings → API keys), put it in `.env`, and continue the flow; report the gateway misconfiguration to the operator. |

## When NOT to use the MCP server

- **Custom CI scripts that need scripted output.** MCP is conversational. For scripted pipelines that operate *within* an app (capture a deployment ID, append dataset rows, mint a key), call the gateway REST endpoints directly with `curl` / a thin SDK and an `AGENTMARK_API_KEY` — same shapes, no MCP client. Note: **app provisioning is not available to a CI `AGENTMARK_API_KEY`** (it's app-scoped). Create the app first via the dashboard or an interactive `agentmark login` session, then pass its `AGENTMARK_APP_ID` to CI.

  **On the REST path, app-scoped endpoints need TWO headers** — `Authorization: Bearer <token>` **and** `X-Agentmark-App-Id: <app uuid>` — even under a tenant-wide session bearer. The MCP server injects the app header for you, so this only surfaces on direct REST: tenant-tier calls (`POST /v1/apps`, `GET /v1/apps`) work with the bearer alone, then the first app-scoped call (e.g. `POST /v1/api-keys`) fails `401 "Missing app id"` — the asymmetry makes it look like an auth problem when it's a missing header. Contract reference: `https://docs.agentmark.co/api-reference/authentication.md`.
- **Bulk data movement.** For migrations or backfills (thousands of items), use the gateway's bulk endpoints directly. The MCP server isn't optimized for high-throughput sequential calls; each tool call is a round-trip from the IDE.
- **Anywhere the `agentmark` CLI already has a typed command** (e.g. `agentmark login`, `agentmark dev`, `agentmark link`, `agentmark run-experiment`). The CLI commands have hand-curated UX (project detection, interactive prompts, structured output) that's better for humans than raw API calls.

## Why MCP and not something custom

MCP became the de facto agent-IDE protocol in 2025: Anthropic, OpenAI (ChatGPT desktop), Microsoft (VS Code Copilot), Cursor, Zed, Continue, and most other major IDEs all consume it. Vendors building agent-oriented developer tools (Stripe, Cloudflare, GitHub, Linear, Notion, Sentry, …) ship MCP servers as their primary headless surface in addition to traditional REST. AgentMark follows the same pattern.

The choice is not "MCP vs REST" but "MCP **and** REST" — REST is the source of truth, MCP is a generated agent-friendly wrapper. The OpenAPI spec at `api.agentmark.co/v1/openapi.json` is the single source. The MCP server generates tools from it at startup; CI scripts call REST directly; future SDKs will be code-generated from the same spec. Single source, multiple surfaces, zero hand-rolled drift.
