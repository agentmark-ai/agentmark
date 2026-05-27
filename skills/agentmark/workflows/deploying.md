# Deploying

AgentMark deployment is **git-based**. The standalone `agentmark deploy` CLI command was removed; running it now prints a migration hint and exits non-zero. The `--remote` flag on `agentmark dev` was also removed in 0.13.0 along with the `@agentmark-ai/connect` WebSocket package. If you see either in older tutorials, blog posts, or the user's memory, they are stale.

## How deployment works

1. You connect a git provider (GitHub or GitLab) to your AgentMark Cloud app. Use either the Dashboard (interactive) or the headless surface (MCP `start_app_git_connect` tool or `POST /v1/apps/{appId}/git/connect` — see [Headless deployment](#headless-deployment-autonomous-agents-ci-automation)).
2. AgentMark watches the configured branch.
3. On every push that touches the AgentMark project files (`agentmark.json`, anything under `agentmarkPath`), AgentMark builds and deploys.
4. Prompts and config sync to Cloud; the version becomes loadable via the SDK in your runtime.

For setup and the git-provider connection flow, fetch `https://docs.agentmark.co/deploy/deployment.md`.

## Headless deployment (autonomous agents, CI, automation)

Deployment is git-based, but the surrounding setup is fully accessible from headless surfaces. Pick the right tool for the runtime:

- **IDE agent (Claude Code, Cursor, VS Code Copilot)** → run the `agentmark-mcp` MCP server and call its tools. See [headless-with-mcp.md](headless-with-mcp.md). This is the recommended path; it's how the user's IDE agent typed `set up an agentmark app and connect github` and got it done in three tool calls.
- **CI / shell script with no MCP client** → call the gateway's REST API with `curl` and an `AGENTMARK_API_KEY`. The MCP tools are generated from the same OpenAPI spec, so the request shapes are identical — only the transport differs.

The only steps that **still** require a human at a browser are the one-click GitHub / GitLab OAuth install (the provider mandates the click-through) and the Dashboard-only branch picker.

| Step | Headless? | MCP tool | REST endpoint |
|---|---|---|---|
| Create an AgentMark Cloud app | **Yes** | `create_app` | `POST /v1/apps` |
| Mint a git-connect URL | **Yes** | `start_app_git_connect` | `POST /v1/apps/{appId}/git/connect` |
| User clicks the URL to authorize the GitHub App | No (provider-mandated) | — | — |
| Poll until the connection registers | **Yes** | `get_app_git_connection` | `GET /v1/apps/{appId}/git/connection` |
| Configure the watched branch + `agentmarkPath` | No — Dashboard | — | — |
| Mint an API key | **Yes** | `create_api_key` | `POST /v1/api-keys` |
| Commit + push prompt changes | **Yes** | — (git, not API) | — |
| Wait for build + deploy to complete | **Yes** | `list_deployments` | `GET /v1/deployments` |
| Consume the deployed prompt | **Yes** | — (SDK runtime) | — |

So the *only* hard human-in-the-loop step left is the git-provider OAuth install. Everything else can be scripted.

### Auth: default is the login session, env-var key is the override

After `agentmark login`, the session bearer cached at `~/.agentmark/auth.json` is the **default** authentication for both the MCP server and direct REST calls. Individual developers running an IDE agent locally use this — no API key required.

The `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` env vars **override** that default in non-interactive contexts (CI, production agents, scripted runs where opening a browser to log in isn't possible). Setting them bypasses the session bearer entirely and authenticates with an app-scoped key + role-scoped permissions.

```bash
# CI / non-interactive override — env vars take precedence over the login session
export AGENTMARK_API_URL=https://api.agentmark.co       # or stg / preview API URL
export AGENTMARK_API_KEY=am_…                           # minted via Dashboard or POST /v1/api-keys
export AGENTMARK_APP_ID=<uuid>                          # the app this key is scoped to
```

The precedence order is (highest → lowest):

1. `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` env vars
2. Session bearer from `~/.agentmark/auth.json` (after `agentmark login`)
3. Legacy forwarding config from `agentmark link`

This matches the env-var-overrides-login pattern other major dev-tool CLIs follow — Wrangler (Cloudflare), gh (GitHub), gcloud Application Default Credentials, and AWS CLI all check env-var tokens before stored login credentials. An explicit env var always wins; the login session never silently overrides an explicit CI configuration.

### Pointing the CLI at a non-prod environment

Every URL the CLI talks to is overridable via env var (env > flag > prod default). Set these once in your shell or CI config and every command targets the alternate environment:

```bash
# Dashboard / platform OAuth — where `agentmark login` opens the browser handoff,
# and where `agentmark link` fetches the apps list.
export AGENTMARK_PLATFORM_URL=https://stg.agentmark.co

# Gateway — where the MCP server and direct REST calls land, and
# where the trace forwarder sends OTLP. Also written to dev-config.json
# on link.
export AGENTMARK_API_URL=https://api-stg.agentmark.co

# Supabase project (auth refresh + session-bearer validation). REQUIRED
# alongside AGENTMARK_PLATFORM_URL — login tokens minted by one Supabase
# project can't refresh against another. Both values come from the
# Supabase dashboard's API settings page for the project that backs
# your AgentMark instance.
export AGENTMARK_SUPABASE_URL=https://<your-project-ref>.supabase-host   # DEFAULT_SUPABASE_URL
export AGENTMARK_SUPABASE_ANON_KEY=eyJ…   # public anon key for that project
```

The CLI also accepts `--base-url` on `login` / `logout` / `link` for one-shot overrides without exporting env vars.

### Headless `agentmark login`

> **Verify your CLI first:** run `agentmark login --help`. The `--print-url` / `--json` flags below require a recent CLI build; if your installed (published) version lists only `--base-url`, the headless print-url/JSON flow isn't available yet and `login` will open the system browser (which blocks in headless contexts). This skill's CLI reference is generated from the development source and can run ahead of the published npm package — when in doubt, `--help` is the source of truth.

`agentmark login` opens the system browser by default. In SSH'd shells, CI runners, or IDE-embedded agents where a background browser-open doesn't make sense, pass `--print-url` to print the auth URL instead. The user clicks the URL in their own browser; the local callback server in the CLI receives the tokens exactly as in the default flow.

```bash
# Print the URL instead of opening a browser. The CLI's local server still
# listens on a random port and the dashboard still relays tokens back.
agentmark login --print-url
agentmark login --print-url --json     # machine-readable envelopes
```

With `--json`, login emits two events on stdout (one per line of JSON):

1. `{"awaiting_auth": true, "url": "https://…/auth/cli?…", "port": 12345, "state": "…"}` — emitted before the CLI blocks waiting for the callback. A wrapper script can capture the URL programmatically.
2. `{"logged_in": true, "user_id": "…", "email": "…"}` — emitted once the user completes sign-in.

`agentmark logout --json` → `{"logged_out": true, "was_logged_in": <bool>, "revoked_dev_key": <bool>}`.

`agentmark link --json` → `{"linked": true, "appId": "…", "appName": "…", "tenantId": "…", "orgName": "…", "baseUrl": "…"}` so CI can capture the linked appId.

**Never call `agentmark login` without `--print-url` from headless contexts** — the default `open()` call hands the URL to a system browser that the agent doesn't control, then blocks for the callback.

#### Recipe for an agent orchestrating login on behalf of a user

When you (an agent) are getting a user signed in to AgentMark — e.g. inside Claude Code, an IDE plugin, a chat — drive the flow like this:

1. **Pre-warn the user.** The CLI's callback server times out after ~2 minutes of inactivity. Tell the user explicitly: *"I'm about to print a URL. Click it in your browser within ~2 minutes."* Confirm they're ready BEFORE invoking the CLI — otherwise the URL prints, you spend turn-time formatting it for them, the user reads it, switches to a browser, and the window closes mid-click.
2. **Invoke `agentmark login --print-url --json`** in the background. Don't run it foreground — it blocks until the user completes sign-in, and you can't surface the URL while blocked.
3. **Read the first JSON line from stdout** — `{"awaiting_auth": true, "url": "...", "port": ..., "state": "..."}`. This appears within 1 second of launch.
4. **Surface the `url` to the user with maximum prominence.** Render it as a clickable link or a fenced code block on its own line. Don't bury it in prose.
5. **Wait for the process to exit.** Poll `~/.agentmark/auth.json` for existence, or wait for the CLI process to finish. The success line `{"logged_in": true, ...}` appears on completion; `{"logged_in": false, "error": "timed_out"}` appears if the user didn't click in time.
6. **On timeout**, restart from step 1 with the SAME pre-warn. Don't dump the URL and run away — the user needs to be ready to click.

What NOT to do: surface the URL without warning the user about the timing constraint, then chain on more analysis turns before checking back. By the time you check, the callback window has closed and the user clicks into a dead local port — they see `ERR_CONNECTION_REFUSED` from `localhost:<port>/callback?…` while their stg session tokens sit in the URL bar uselessly.

### Bootstrap a Cloud app headlessly

For a fresh user with zero apps. Two equivalent paths:

**Path A — IDE agent via MCP** (recommended when you're chatting with an agent):

```text
user → "set up a new agentmark app and connect it to my github"
agent (via the agentmark-mcp tool surface):
  1. create_app({ name: "my-agent", runtime: "nodejs" })
       → { data: { id: "<APP_ID>", … } }
  2. start_app_git_connect({ appId: "<APP_ID>", provider: "github" })
       → { data: { authorization_url: "https://github.com/apps/agentmark/installations/new?state=…",
                   state: "…" } }
  3. Agent prints the URL; user clicks once to authorize on GitHub.
  4. Agent polls get_app_git_connection({ appId }) every few seconds until
     data.connected === true. (Install URL is HMAC-signed, ~10 min TTL —
     if it expires, agent re-runs start_app_git_connect.)
  5. Agent calls create_api_key({ appId, name: "ci",
                                  permissions: ["template.read", "trace.write"] })
       → { data: { plaintext_key: "am_…" } }   # SHOWN ONCE — capture immediately
```

See [headless-with-mcp.md](headless-with-mcp.md) for MCP server setup, client config, and the full tool list.

**Path B — bash + curl** (CI runners, no MCP client available):

```bash
# 1. Ensure auth env vars are set (CI) or run `agentmark login` once locally.
: "${AGENTMARK_API_URL:=https://api.agentmark.co}"
AUTH_HEADER="Authorization: Bearer ${AGENTMARK_API_KEY:-$(jq -r .access_token ~/.agentmark/auth.json)}"

# 2. Create the app — tenant-scoped route, no X-Agentmark-App-Id header needed.
APP_ID=$(curl -fsS -X POST "$AGENTMARK_API_URL/v1/apps" \
           -H "$AUTH_HEADER" -H "Content-Type: application/json" \
           -d '{"name":"my-agent","runtime":"nodejs"}' \
         | jq -r '.data.id')

# 3. Mint an install URL for GitHub.
INSTALL_URL=$(curl -fsS -X POST "$AGENTMARK_API_URL/v1/apps/$APP_ID/git/connect" \
                -H "$AUTH_HEADER" -H "Content-Type: application/json" \
                -d '{"provider":"github"}' \
              | jq -r '.data.authorization_url')
echo "Open this URL to grant the GitHub App access: $INSTALL_URL"

# 4. After the human (or service account) completes the install,
#    poll until the connection is registered.
DEADLINE=$(( $(date +%s) + 300 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  CONNECTED=$(curl -fsS "$AGENTMARK_API_URL/v1/apps/$APP_ID/git/connection" \
                -H "$AUTH_HEADER" \
              | jq -r '.data.connected')
  case "$CONNECTED" in
    true) echo "git connected"; break ;;
    *) sleep 5 ;;
  esac
done

# 5. Mint an API key for this app so downstream runtimes (SDK, CI)
#    can authenticate without a session. plaintext_key is returned ONCE.
curl -fsS -X POST "$AGENTMARK_API_URL/v1/api-keys" \
  -H "$AUTH_HEADER" -H "Content-Type: application/json" \
  -d "{\"app_id\":\"$APP_ID\",\"name\":\"ci\",\"permissions\":[\"template.read\",\"trace.write\"]}" \
  | jq -r '.data.plaintext_key'
```

The install URL is a one-shot signed envelope (HMAC-SHA256, ~10 min TTL). If the human takes longer than the TTL, re-run step 3 to mint a fresh URL. After the install completes, the `git_connection` row exists and step 4's poll flips to `connected: true`.

### Headless commit → push → poll pattern

> **Any commit on the tracked branch deploys.** The committer can be the agent's own git identity — it does **not** need to map to an org member. Authorization comes from the connected repo and the tracked branch (a member set those up), not from who typed the commit. AgentMark records the committer for attribution only: if the committer email matches a member (or the pushing account is a registered git identity) the deploy is attributed to that member, otherwise it deploys with null attribution. Either way the push deploys.

```bash
# 1. Commit prompt changes to the watched branch (any committer identity works).
git add agentmark.json agentmark/triage.prompt.mdx
git commit -m "feat: triage prompt v$VERSION"
git push origin "$WATCHED_BRANCH"

# 2. Poll deployments until the latest one finishes
: "${AGENTMARK_API_URL:=https://api.agentmark.co}"
AUTH_HEADER="Authorization: Bearer ${AGENTMARK_API_KEY:-$(jq -r .access_token ~/.agentmark/auth.json)}"
DEADLINE=$(( $(date +%s) + 600 ))   # 10 min budget
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  STATUS=$(curl -fsS "$AGENTMARK_API_URL/v1/deployments?limit=1" \
            -H "$AUTH_HEADER" -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID" \
            | jq -r '.data[0].deployment_status')
  case "$STATUS" in
    succeeded) echo "deploy ok"; break ;;
    failed|canceled) echo "deploy $STATUS" >&2; exit 1 ;;
    *) sleep 5 ;;
  esac
done

# 3. Sanity-check the synced config
curl -fsS "$AGENTMARK_API_URL/v1/config" \
  -H "$AUTH_HEADER" -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
```

IDE-agent equivalent (MCP):

```text
agent: list_deployments({ limit: 1 })
       → { data: [{ deployment_status, files_status, code_status, … }] }
agent: get_config()
       → { data: { … } }
```

After the poll loop exits cleanly, the new prompt version is loadable via the SDK in any runtime that has the same `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID`.

## Inspecting deployments

The gateway exposes deployment state under the `deployments` resource. Both surfaces work; pick the one that matches your runtime:

```bash
# REST — scriptable; uses AGENTMARK_API_KEY for auth
curl -fsS "$AGENTMARK_API_URL/v1/deployments" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"

curl -fsS "$AGENTMARK_API_URL/v1/deployments?status=running" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"   # "is my deploy still going?"

curl -fsS "$AGENTMARK_API_URL/v1/deployments/<deploymentId>" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
```

MCP equivalents: `list_deployments({ limit?, status? })`, `get_deployment({ deploymentId })`.

The response includes `deployment_status`, `files_status`, `code_status`, commit metadata, and timing — usually sufficient without hitting a dedicated logs endpoint.

## Linking a local project to a Cloud app

`agentmark login` and `agentmark link` cover different surfaces:

- **`agentmark login`** authenticates the *user*. OAuth in the browser, session bearer stored at `~/.agentmark/auth.json`. After this, the MCP server and any direct REST calls use that bearer to talk to Cloud as the user, with permissions derived from the user's role in the tenant.
- **`agentmark link`** binds the *project* (working directory) to a specific Cloud app. Interactive picker (or `--app-id`), writes `{ appId, appName, tenantId, orgName, baseUrl }` to `.agentmark/dev-config.json`. **No API key is minted.** The trace forwarder inside `agentmark dev` reads `appId` from this file and authenticates with the session bearer from `auth.json` (auto-refreshed when expired), so the user's actual permissions enforce — there is no scoped per-project key to leak, expire, or diverge from the user's real access.

```bash
npx agentmark login           # OAuth in browser, stores session bearer at ~/.agentmark/auth.json
npx agentmark link            # Interactive app selection — binds this project to a Cloud app
# or:
npx agentmark link --app-id <uuid>
```

`.agentmark/dev-config.json` is gitignored — each developer links their own working copy.

You can `login` without `link` (read Cloud state via the MCP server or direct REST, no per-project binding). You can't meaningfully `link` without `login` first — the picker needs an authenticated session to fetch the app list.

This mirrors the pattern wrangler, vercel, gh, and supabase use: one user-scoped credential drives every CLI surface. Pre-link configs that still carry a legacy `apiKey` field keep working — the forwarder prefers the session bearer but falls back to the legacy key when no fresh session is available.

## Trace forwarding from local

`agentmark dev` runs a fully local development server (API + webhook + UI). **There is no `--remote` flag.** When the project is linked, the dev server automatically forwards local OTLP traces to AgentMark Cloud, so runs you trigger locally show up in the Dashboard.

```bash
# Local dev with automatic trace forwarding (when linked)
npx agentmark dev

# Local dev with forwarding disabled (still linked, just don't send traces)
npx agentmark dev --no-forward

# Local dev without the UI app (for CI / headless / test contexts)
npx agentmark dev --no-ui
```

If the project is not linked, `dev` still runs — it just has nothing to forward to. Link the project to enable forwarding; there is no flag to enable it explicitly.

## Configuration sync

`agentmark.json` (including `scores`, model registry, etc.) syncs on deploy. Read the synced config from Cloud:

```bash
# REST
curl -fsS "$AGENTMARK_API_URL/v1/config" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"

# or via MCP: agent calls get_config()
```

This is the authoritative answer to "what does Cloud think my config looks like right now?" — it can lag the working tree if a deploy is in progress.

## API keys

You only need an API key for non-interactive contexts (CI, production SDK runtime, autonomous agents that can't open a browser). For everything else, the session bearer from `agentmark login` is sufficient.

Two ways to mint a Cloud API key:

- **Dashboard**: app's *Settings → API keys*. Pick a role (SDK / Read-Only / Full Access) or toggle individual permissions, copy the key — shown once.
- **REST / MCP**: `POST /v1/api-keys` with body `{ app_id, name, permissions: ["template.read","trace.write"] }` (MCP equivalent: `create_api_key({ app_id, name, permissions })`). Response contains `data.plaintext_key` — capture it on the spot, subsequent reads expose only metadata. Auth via session bearer (after `agentmark login`) or another API key with `api_key.insert` permission.

- For environment variable names (`AGENTMARK_API_KEY`, `AGENTMARK_APP_ID`, etc.), fetch `https://docs.agentmark.co/configure/environment-variables.md`.
- For API key lifecycle and rotation, fetch `https://docs.agentmark.co/deploy/api-keys.md`.

## Common mistakes

- **Running `agentmark deploy`** — removed; deployment is git-based. The CLI stub prints a migration hint. Point users at `https://docs.agentmark.co/deploy/deployment.md`.
- **Passing `--remote` to `agentmark dev`** — removed in 0.13.0. Trace forwarding is automatic when the project is linked. For programmatic Cloud access (what `--remote` once enabled for the CLI's gateway-proxy commands), use the MCP server or call REST directly — see [headless-with-mcp.md](headless-with-mcp.md).
- **Editing `agentmark.json` in the Dashboard** — `agentmark.json` is the source of truth in git and syncs on deploy. Dashboard-side edits get overwritten on the next deploy.
- **Forgetting to commit `agentmark.json` changes before pushing** — the deploy picks up only what's in git. Local-only changes don't ship.
- **Sharing `.agentmark/dev-config.json`** — it's gitignored and per-developer. New configs hold only the project↔app binding; legacy configs from older CLI versions also carry a dev API key.
- **Calling `agentmark login` from a headless context** — opens a browser and hangs the agent. Use `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` env vars instead (see "Headless deployment" above).
- **Trying to consume a prompt immediately after `git push`** — the deploy is async. Poll `GET /v1/deployments` (or MCP `list_deployments`) until status is `succeeded` before reading the new version via the SDK.
- **Expecting a `prompts run` or `POST /v1/prompts/{name}/run` endpoint** — there isn't one. Execution happens in customer code via the SDK; the gateway is observability + config storage. See `SKILL.md` § Runtime model.
