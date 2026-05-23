# Deploying

AgentMark deployment is **git-based**. The standalone `agentmark deploy` CLI command was removed; running it now prints a migration hint and exits non-zero. The `--remote` flag on `agentmark dev` was also removed in 0.13.0 along with the `@agentmark-ai/connect` WebSocket package. If you see either in older tutorials, blog posts, or the user's memory, they are stale.

## How deployment works

1. You connect a git provider (GitHub or GitLab) to your AgentMark Cloud app. Use either the Dashboard (interactive) or the CLI / API (`agentmark api apps start-app-git-connect …` — see [Headless deployment](#headless-deployment-autonomous-agents-ci-automation)).
2. AgentMark watches the configured branch.
3. On every push that touches the AgentMark project files (`agentmark.json`, anything under `agentmarkPath`), AgentMark builds and deploys.
4. Prompts and config sync to Cloud; the version becomes loadable via the SDK in your runtime.

For setup and the git-provider connection flow, fetch `https://docs.agentmark.co/deploy/deployment.md`.

## Headless deployment (autonomous agents, CI, automation)

Deployment is git-based, but most of the surrounding setup is now accessible from the CLI / API too. The only steps that **still** require a human at a browser are the one-click GitHub / GitLab OAuth install (the provider mandates the click-through) and the Dashboard-only branch picker.

| Step | Headless? | How |
|---|---|---|
| Create an AgentMark Cloud app | **Yes** | `agentmark api apps create-app --remote --name <name>` (see [Bootstrap a Cloud app headlessly](#bootstrap-a-cloud-app-headlessly)). |
| Connect a git provider | **Partial** | API mints a one-time install URL via `agentmark api apps start-app-git-connect --remote …`; a human (or a service account with browser credentials) still has to click through GitHub's / GitLab's install screen. Once the install completes, the rest is fully headless. Poll status with `agentmark api apps get-app-git-connection --remote`. |
| Configure the watched branch + `agentmarkPath` | No — Dashboard | The branch picker is Dashboard-only today. `agentmarkPath` lives in `agentmark.json` in git, not Cloud. |
| Mint an API key | **Yes** | `agentmark api api-keys create-api-key --remote …` after the app exists. Plaintext returned ONCE — capture it. |
| Commit + push prompt changes | **Yes** | The headless path continues here. |
| Wait for build + deploy to complete | **Yes** | Poll `agentmark api deployments list-deployments --remote`. |
| Consume the deployed prompt | **Yes** | Via SDK using `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID`. |

So the *only* hard human-in-the-loop step left is the git-provider OAuth install. Everything else can be scripted.

### Auth: default is the login session, env-var key is the override

After `agentmark login`, the session bearer cached at `~/.agentmark/auth.json` is the **default** authentication for every `agentmark api … --remote` call. You do not need to mint or pass an API key for normal use — the CLI picks up the bearer and refreshes it automatically. RLS-derived permissions (the user's role in the tenant) apply.

The `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` env vars exist to **override** that default in non-interactive contexts (CI, production agents, scripted runs where opening a browser to log in isn't possible). Setting them bypasses the session bearer entirely and authenticates with an app-scoped key + role-scoped permissions.

```bash
# CI / non-interactive override — env vars take precedence over the login session
export AGENTMARK_API_URL=https://api.agentmark.co       # or stg / preview API URL
export AGENTMARK_API_KEY=am_…                           # from `agentmark api api-keys create-api-key`
export AGENTMARK_APP_ID=<uuid>                          # the app this key is scoped to
```

The precedence order in `--remote` mode is (highest → lowest):

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

# Gateway — where `agentmark api … --remote` calls land and where the
# trace forwarder sends OTLP. Also written to dev-config.json on link.
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

For a fresh user with zero apps. specli convention: path params are positional, body fields are `--<field>` flags. Run `agentmark api <resource> <action> --help` to see the exact shape for any step:

```bash
# 1. One-time interactive login (skip if using AGENTMARK_API_KEY env vars)
agentmark login

# 2. Create the app — tenant-scoped route, no X-Agentmark-App-Id header needed.
#    CreateAppBodySchema = { name, runtime? } → --name + --runtime flags.
APP_ID=$(agentmark api apps create-app --remote \
           --name "my-agent" --runtime nodejs \
           | jq -r '.data.id')

# 3. Mint an install URL for GitHub.
#    Path param <appId> is positional; body field `provider` is --provider.
INSTALL_URL=$(agentmark api apps start-app-git-connect "$APP_ID" --remote \
                --provider github \
                | jq -r '.data.authorization_url')
echo "Open this URL to grant the GitHub App access: $INSTALL_URL"

# 4. After the human (or service account) completes the install,
#    poll until the connection is registered.
DEADLINE=$(( $(date +%s) + 300 ))
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  CONNECTED=$(agentmark api apps get-app-git-connection "$APP_ID" --remote \
                | jq -r '.data.connected')
  case "$CONNECTED" in
    true) echo "git connected"; break ;;
    *) sleep 5 ;;
  esac
done

# 5. Mint an API key for this app so downstream runtimes (SDK, CI)
#    can authenticate without a session. Capture plaintext_key — it is
#    returned ONCE.
agentmark api api-keys create-api-key --remote \
  --app_id "$APP_ID" --name "ci" --permissions '["template.read","trace.write"]' \
  | jq -r '.data.plaintext_key'
```

The install URL is a one-shot signed envelope (HMAC-SHA256, ~10 min TTL). If the human takes longer than the TTL, re-run step 3 to mint a fresh URL. After the install completes, the `git_connection` row exists and step 4's poll flips to `connected: true`.

### Headless commit → push → poll pattern

```bash
# 1. Commit prompt changes to the watched branch
git add agentmark.json agentmark/triage.prompt.mdx
git commit -m "feat: triage prompt v$VERSION"
git push origin "$WATCHED_BRANCH"

# 2. Poll deployments until the latest one finishes
DEADLINE=$(( $(date +%s) + 600 ))   # 10 min budget
while [ "$(date +%s)" -lt "$DEADLINE" ]; do
  STATUS=$(npx agentmark api deployments list-deployments --remote --limit 1 \
            | jq -r '.deployments[0].deployment_status')
  case "$STATUS" in
    succeeded) echo "deploy ok"; break ;;
    failed|canceled) echo "deploy $STATUS" >&2; exit 1 ;;
    *) sleep 5 ;;
  esac
done

# 3. Sanity-check the synced config
npx agentmark api config get-config --remote
```

After the poll loop exits cleanly, the new prompt version is loadable via the SDK in any runtime that has the same `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID`.

## Inspecting deployments from the CLI

The gateway exposes deployment state under the `deployments` resource. Subcommand shapes are auto-generated from the OpenAPI spec — always run `--help` for the canonical form:

```bash
# Show available actions
npx agentmark api deployments --help

# Typical actions (operationIds → specli action names):
npx agentmark api deployments list-deployments --remote
npx agentmark api deployments list-deployments --remote --status running   # "is my deploy still going?"
npx agentmark api deployments get-deployment <deploymentId> --remote
```

The response includes `deployment_status`, `files_status`, `code_status`, commit metadata, and timing — usually sufficient without hitting a dedicated logs endpoint.

## Linking a local project to a Cloud app

`agentmark login` and `agentmark link` cover different surfaces:

- **`agentmark login`** authenticates the *user*. OAuth in the browser, session bearer stored at `~/.agentmark/auth.json`. After this, `agentmark api … --remote` talks to Cloud as that user, with permissions derived from the user's role in the tenant.
- **`agentmark link`** binds the *project* (working directory) to a specific Cloud app. Interactive picker (or `--app-id`), writes `{ appId, appName, tenantId, orgName, baseUrl }` to `.agentmark/dev-config.json`. **No API key is minted.** The trace forwarder inside `agentmark dev` reads `appId` from this file and authenticates with the session bearer from `auth.json` (auto-refreshed when expired), so the user's actual permissions enforce — there is no scoped per-project key to leak, expire, or diverge from the user's real access.

```bash
npx agentmark login           # OAuth in browser, stores session bearer at ~/.agentmark/auth.json
npx agentmark link            # Interactive app selection — binds this project to a Cloud app
# or:
npx agentmark link --app-id <uuid>
```

`.agentmark/dev-config.json` is gitignored — each developer links their own working copy.

You can `login` without `link` (read Cloud state with `agentmark api … --remote`, no per-project binding). You can't meaningfully `link` without `login` first — the picker needs an authenticated session to fetch the app list.

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
npx agentmark api config get-config --remote
```

This is the authoritative answer to "what does Cloud think my config looks like right now?" — it can lag the working tree if a deploy is in progress.

## API keys

You only need an API key for non-interactive contexts (CI, production SDK runtime, autonomous agents that can't open a browser). For everything else, the session bearer from `agentmark login` is sufficient.

Two ways to mint a Cloud API key:

- **Dashboard**: app's *Settings → API keys*. Pick a role (SDK / Read-Only / Full Access) or toggle individual permissions, copy the key — shown once.
- **CLI / API**: `agentmark api api-keys create-api-key --remote --app_id <uuid> --name <name> --permissions '["template.read","trace.write"]'`. Response contains `data.plaintext_key` — capture it on the spot, subsequent reads expose only metadata. Auth via session bearer (after `agentmark login`) or another API key with `api_key.insert` permission.

- For environment variable names (`AGENTMARK_API_KEY`, `AGENTMARK_APP_ID`, etc.), fetch `https://docs.agentmark.co/configure/environment-variables.md`.
- For API key lifecycle and rotation, fetch `https://docs.agentmark.co/deploy/api-keys.md`.

## Common mistakes

- **Running `agentmark deploy`** — removed; deployment is git-based. The CLI stub prints a migration hint. Point users at `https://docs.agentmark.co/deploy/deployment.md`.
- **Passing `--remote` to `agentmark dev`** — removed in 0.13.0. Trace forwarding is automatic when the project is linked. The `--remote` flag on `agentmark api` is unaffected (it routes to Cloud instead of local).
- **Editing `agentmark.json` in the Dashboard** — `agentmark.json` is the source of truth in git and syncs on deploy. Dashboard-side edits get overwritten on the next deploy.
- **Forgetting to commit `agentmark.json` changes before pushing** — the deploy picks up only what's in git. Local-only changes don't ship.
- **Sharing `.agentmark/dev-config.json`** — it's gitignored and per-developer. New configs hold only the project↔app binding; legacy configs from older CLI versions also carry a dev API key.
- **Calling `agentmark login` from a headless context** — opens a browser and hangs the agent. Use `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` env vars instead (see "Headless deployment" above).
- **Trying to consume a prompt immediately after `git push`** — the deploy is async. Poll `deployments list-deployments` until status is `succeeded` before reading the new version via the SDK.
- **Expecting a `prompts run` or `POST /v1/prompts/{name}/run` endpoint** — there isn't one. Execution happens in customer code via the SDK; the gateway is observability + config storage. See `SKILL.md` § Runtime model.
