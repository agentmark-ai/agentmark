# Deploying

AgentMark deployment is **git-based**. The standalone `agentmark deploy` CLI command was removed; running it now prints a migration hint and exits non-zero. The `--remote` flag on `agentmark dev` was also removed in 0.13.0 along with the `@agentmark-ai/connect` WebSocket package. If you see either in older tutorials, blog posts, or the user's memory, they are stale.

## How deployment works

1. You connect a git provider (GitHub or GitLab) to your AgentMark Cloud app via the Dashboard.
2. AgentMark watches the configured branch.
3. On every push that touches the AgentMark project files (`agentmark.json`, anything under `agentmarkPath`), AgentMark builds and deploys.
4. Prompts and config sync to Cloud; the version becomes loadable via the SDK in your runtime.

For setup and the git-provider connection flow, fetch `https://docs.agentmark.co/deploy/deployment.md`.

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

Before you can read Cloud state or have your local runs forward traces to Cloud, link the project:

```bash
npx agentmark login           # OAuth in browser, stores credentials
npx agentmark link            # Interactive app selection
# or:
npx agentmark link --app-id <uuid>
```

After `link`, `.agentmark/dev-config.json` stores the app ID and a dev API key. This file is gitignored — each developer links their own working copy.

The dev API key expires after 30 days. Re-running `link` refreshes it.

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

Cloud API keys are created from the Dashboard. The CLI does not mint user-facing keys (only the dev API key used by `agentmark link`).

- For environment variable names (`AGENTMARK_API_KEY`, `AGENTMARK_APP_ID`, etc.), fetch `https://docs.agentmark.co/configure/environment-variables.md`.
- For API key lifecycle and rotation, fetch `https://docs.agentmark.co/deploy/api-keys.md`.

Use the dev API key (auto-created by `agentmark link`) for development; use a Dashboard-created key for production runtime SDK calls.

## Common mistakes

- **Running `agentmark deploy`** — removed; deployment is git-based. The CLI stub prints a migration hint. Point users at `https://docs.agentmark.co/deploy/deployment.md`.
- **Passing `--remote` to `agentmark dev`** — removed in 0.13.0. Trace forwarding is automatic when the project is linked. The `--remote` flag on `agentmark api` is unaffected (it routes to Cloud instead of local).
- **Editing `agentmark.json` in the Dashboard** — `agentmark.json` is the source of truth in git and syncs on deploy. Dashboard-side edits get overwritten on the next deploy.
- **Forgetting to commit `agentmark.json` changes before pushing** — the deploy picks up only what's in git. Local-only changes don't ship.
- **Sharing `.agentmark/dev-config.json`** — it's gitignored and per-developer. Sharing it leaks a dev API key.
