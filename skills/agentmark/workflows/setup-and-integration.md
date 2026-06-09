# Setup & integration

Triggered when a user says "set up AgentMark in this project," "wire AgentMark into my app," "integrate AgentMark with my existing code," or after they hit the handoff line printed by `npm create agentmark`. This workflow takes the user from "MCP config + `agentmark.json` on disk" to "a working prompt loads in the SDK and a trace shows up in `agentmark dev`."

If the user wants to *provision a Cloud app and connect git* without touching local code yet, use [headless-with-mcp.md](headless-with-mcp.md) instead.

## Single source of truth: the docs MCP

This file describes the **shape** of the conversation and the **order** of operations — nothing else. Framework-specific paths, package names, CLI flags, `agentmarkPath` conventions, and every other piece of integration content live in **one place**: `https://docs.agentmark.co`, queryable via the docs MCP server (`https://docs.agentmark.co/mcp`) or by appending `.md` to any docs URL and using `WebFetch`.

**Never encode integration content into this workflow.** When you need to know where a Next.js project's client file goes, what package to install for Pydantic AI, or what flag `agentmark run-prompt` takes — query the docs MCP, or run `npx agentmark <cmd> --help`. If two sources disagree, the docs win. This is the same rule SKILL.md establishes in [How to find current information](../SKILL.md#how-to-find-current-information); a setup workflow is no exception.

If the docs MCP isn't responding, or doesn't cover the user's framework, **stop and tell the user**. Do not invent paths or package names from memory. The right escalation is "the docs don't cover this framework — want me to set it up using the closest covered pattern (X), or hold while we add docs for your stack?"

## Before you start — `doctor` is your setup checklist

**Whenever a user wants to set up AgentMark — a fresh `npm create agentmark` scaffold *or* an existing repo — run `npx agentmark doctor` first.** It inventories the whole scaffold (config, the client / dev-entry / handler files, prompts + `builtInModels`, deps) and prints a concrete `fix` for every gap, so it tells you exactly what the project still needs instead of you guessing. Act on its fixes, re-run to confirm, and keep it in the loop through this entire workflow — it bootstraps the integration and verifies it at the end. (`doctor` is read-only and safe to re-run anytime; `--smoke` actually runs a prompt — see Step 7.)

Then confirm the CLI handoff actually happened — if any are missing, the user skipped `npm create agentmark`:

- [ ] `agentmark.json` exists at the project root
- [ ] `agentmark/` directory exists (the CLI creates it empty, with a `.gitkeep`); `agentmarkPath` in `agentmark.json` resolves the prompt-root to `<agentmarkPath>/agentmark`
- [ ] At least one MCP config file exists (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, or `.zed/settings.json`) and lists **both** the `agentmark` (Cloud) server and the `agentmark-docs` (docs MCP) server
- [ ] Cloud auth resolves — `~/.agentmark/auth.json` exists OR `AGENTMARK_API_KEY` is set
- [ ] Your MCP client lists tools from `agentmark` AND from `agentmark-docs`. Both are required — `agentmark` for Cloud ops, `agentmark-docs` for the integration content this workflow defers to.

If any are missing, tell the user to run `npm create agentmark` first. Do not recreate those files from this workflow — that is the CLI's job, and duplicating it here is how the two paths drift apart.

## Step 1 — Detect the project (filesystem only)

Read the codebase with `Read` / `Glob` / `Grep`. The detection task is local; **do not call MCP tools here**. Identify:

- Language (TypeScript / Python / other) — from `package.json` / `pyproject.toml` / `requirements.txt`
- Framework name and major version (Next.js, Hono, FastAPI, Mastra, etc.)
- Existing LLM-SDK call sites (`streamText`, `generateObject`, `client.messages.create`, `openai.ChatCompletion`, …) — record locations; needed for Step 8
- Monorepo? Workspace boundaries? Identify the host workspace before deciding where AgentMark sits.

Then move to Step 2 — do not propose a placement from your detection alone.

## Step 2 — Fetch the integration page from the docs MCP

Query the docs MCP server for the integration guide. Try in this order:

1. `<framework> integration` (e.g. "Next.js integration")
2. `<framework> quickstart`
3. `bring your own SDK` (`/integrations/bring-your-own-sdk`) — the universal integration path

**The neutral render is the universal path.** AgentMark has **no SDK-specific adapters** — whatever the host calls (Vercel AI SDK, the raw OpenAI/Anthropic client, AWS Bedrock `ConverseCommand`, a bespoke HTTP client), the integration is the same: render the prompt to AgentMark's neutral `{ messages, text_config }` and hand it to that SDK. Never escalate "no adapter exists" or default to the heavyweight custom-adapter page. Fetch `bring your own SDK` from the docs MCP (`/integrations/bring-your-own-sdk`). It has two paths the page explains: **Path A** (`createAgentMarkClient` from `@agentmark-ai/fallback-adapter` + `observe` + `runExperiment`) for prompt-management / tracing / experiments in the user's own process — no executor — and **Path B** (`createExecutor` + `createWebhookRunner`) when the user wants the cloud to *run* their prompts. Pick the path from what the user wants; most "wire AgentMark into my existing app" requests are Path A. On a popular SDK, the [bring-your-own-SDK guide](https://docs.agentmark.co/integrations/bring-your-own-sdk) (Path B) is a copy-paste head start.

Read the page in full. **The page is the authority on**:

- Which `@agentmark-ai/*` (or `agentmark-py`) package to install
- Where the prompts directory goes
- Where the client file goes
- What `agentmarkPath` should be set to
- Any framework-specific gotchas

If no page matches, stop and tell the user. Do not extrapolate from a different framework's page without explicit consent.

## Step 3 — Propose, don't act

Summarize the docs-page guidance back to the user as a concrete plan, **citing the docs page you read**. Example shape:

> Based on the Next.js integration guide (docs.agentmark.co/integrations/nextjs), here's the plan:
>
> 1. Install `<package-from-docs>`
> 2. Place prompts at `<path-from-docs>`
> 3. Add the client file at `<path-from-docs>`
> 4. Scaffold one prompt (chat / search / summarize, depending on your host use case)
> 5. *Separately, after this lands:* propose swapping the existing `streamText({…})` call to load the prompt
>
> I won't change your existing code until you've reviewed the new prompt. Proceed?

Always cite the docs page. If the user disagrees with the guidance, the disagreement is with the docs, not with you — and that's signal worth surfacing.

The user's "yes" is consent to **write new files only** — not to refactor existing code (Step 8).

## Step 4 — Provision the Cloud app (Cloud mode only)

If `agentmark.json` has `handler` set, or the user wants Cloud features, provision via the `agentmark` MCP server. See [headless-with-mcp.md](headless-with-mcp.md) for the `create_app` + `mint_api_key` sequence.

Write `AGENTMARK_API_KEY` and `AGENTMARK_APP_ID` to `.env` (create if absent; **never overwrite existing values without asking**). Confirm `.env` is in `.gitignore`.

## Step 5 — Write files per the docs guidance

Place files at the paths the docs page specified. Two SDK-contract rules override convention (and are themselves documented at SKILL.md and in the docs):

- Prompts root is always **named `agentmark/`** — the SDK loader resolves `<agentmarkPath>/agentmark/`. Setting `agentmarkPath: "/"` instead of `"."` is a known footgun.
- The client file is a **configured factory** — reads `AGENTMARK_API_KEY` / `AGENTMARK_APP_ID` from env, exports a configured client. Importers throughout the codebase use it.

For the full client recipe — `agentmark.client.ts`, the `dev-entry.ts` dev-server entry, and the `handler.ts` deployment entry — fetch `set up your AgentMark client` (Getting Started → Client setup) from the docs MCP and follow it verbatim, including its verification step (`agentmark dev` + `run-prompt`). The dashboard's Run buttons stay disabled until the client is deployed (or a webhook is set), so a Cloud-mode setup isn't complete without it.

If the docs guidance contradicts those two rules, prefer the docs (they may have evolved) but flag the discrepancy to the user.

## Step 6 — Scaffold the first prompt

One prompt only, named after the host's primary use case. Use the minimum viable shape from [creating-prompts.md](creating-prompts.md). After writing, regenerate types per the docs' instructions for the detected language (do not encode the command here).

## Step 7 — Smoke test

Verify the scaffold before handing back. Run `npx agentmark doctor` first: it statically checks `agentmark.json`, the client / dev-entry / handler files, prompts + `builtInModels`, and deps, and prints a concrete fix for anything wrong. Then boot the dev server and run an end-to-end check with `npx agentmark doctor --smoke`: it runs the prompt and confirms the emitted trace round-trips with the right shape (a model, token usage, input, output), which is the fastest way to catch a bad key, an SDK/adapter mismatch, or unwired tracing. Exact commands and flags via `npx agentmark <cmd> --help`. **Do not encode CLI surface in this workflow.** In Cloud mode, also confirm the trace appears via the `agentmark` MCP server's trace tools within a few seconds. If anything fails, fix it (doctor names the fix) before handing back to the user.

## Step 8 — Migrate existing LLM code (separate confirmation)

If Step 1 found existing `streamText` / `generateObject` / `client.messages.create` calls, **do not migrate them as part of setup**. Setup ends at Step 7. Migration is a separate confirmation:

> Setup is done. I noticed 3 places that call the AI SDK directly. Want me to migrate those to load AgentMark prompts? I'll preserve inputs/outputs and open it as a separate change so it's easy to review.

Migration is a refactor with its own risk profile. Conflating it with setup makes review harder and inflates blast radius.

## Common mistakes

- **Encoding integration content into this workflow.** Paths, packages, CLI flags, framework recommendations — all of those live in the docs. Drift between skill and docs is how agents end up recommending stale packages. Always defer to the docs MCP.
- **Skipping the docs-MCP query** because you "remember" how Next.js / FastAPI / Mastra setup works. Your memory is wrong; the docs are right.
- **Inventing a path or package when no docs page covers the framework.** Stop and tell the user. The escalation is to ask whether to use the closest covered pattern as a starting point — not to guess.
- **Recreating `agentmark.json` or MCP config files from this workflow** — that's the CLI's job. If those files are missing, send the user back to `npm create agentmark`.
- **Calling the `agentmark` (Cloud) MCP server for project detection** — that server is for AgentMark Cloud, not local file inspection. Use `Read` / `Glob` / `Grep`.
- **Migrating existing LLM code without a second confirmation.** Setup consent ≠ refactor consent.
- **Hunting for an "adapter," or defaulting to the custom-adapter page.** There are no SDK-specific adapters — every SDK integrates through the neutral render. Fetch `/integrations/bring-your-own-sdk` and route to Path A (lightweight, no executor) or Path B (`createExecutor`, cloud-executed). A full custom adapter only earns its keep when you want AgentMark to own the provider request shape — rarely what these users need.
