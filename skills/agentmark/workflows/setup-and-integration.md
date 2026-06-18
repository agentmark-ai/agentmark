# Setup & integration

Triggered when a user says "set up AgentMark in this project," "wire AgentMark into my app," "integrate AgentMark with my existing code," or after they hit the handoff line printed by `agentmark init`. This workflow takes the user from "MCP config + `agentmark.json` on disk" to "a working prompt loads in the SDK and a trace shows up in `agentmark dev`."

If the user wants to *provision a Cloud app and connect git* without touching local code yet, use [headless-with-mcp.md](headless-with-mcp.md) instead.

## Single source of truth: the docs

This file describes the **shape** of the conversation and the **order** of operations — nothing else. Framework-specific paths, package names, CLI flags, `agentmarkPath` conventions, and every other piece of integration content live in **one place**: the docs at `https://docs.agentmark.co`.

**Never encode integration content into this workflow, and never write a client, executor, or prompt from memory.** Look everything up using the skill's single doc-lookup precedence — SKILL.md → [How to find current information](../SKILL.md#how-to-find-current-information): **orient with `https://docs.agentmark.co/llms.txt` to find the right page, then `WebFetch` that page's `.md`** (search the docs MCP `https://docs.agentmark.co/mcp` only if the index doesn't surface it), plus `agentmark <cmd> --help` for CLI flags. Orient and read the page *before* you write the file — that is what prevents invalid shapes (`<Human>`, `metadata.model.name`, a top-level `model`). If two sources disagree, the docs win.

If the docs don't cover the user's framework, **stop and tell the user**. Do not invent paths or package names from memory. The right escalation is "the docs don't cover this framework — want me to set it up using the closest covered pattern (X), or hold while we add docs for your stack?"

## Before you start — `doctor` is your setup checklist

**Whenever a user wants to set up AgentMark — a fresh `agentmark init` scaffold *or* an existing repo — run `agentmark doctor` first.** It inventories the whole scaffold (config, the client / dev-entry / handler files, prompts + `builtInModels`, deps) and prints a concrete `fix` for every gap, so it tells you exactly what the project still needs instead of you guessing. Act on its fixes, re-run to confirm, and keep it in the loop through this entire workflow — it bootstraps the integration and verifies it at the end. (`doctor` is read-only and safe to re-run anytime; `--smoke` actually runs a prompt — see Step 6.)

Then confirm the CLI handoff actually happened — if any are missing, the user skipped `agentmark init`:

- [ ] `agentmark.json` exists at the project root
- [ ] `agentmark/` directory exists (the CLI creates it empty, with a `.gitkeep`); `agentmarkPath` in `agentmark.json` resolves the prompt-root to `<agentmarkPath>/agentmark`
- [ ] At least one MCP config file exists (`.mcp.json`, `.vscode/mcp.json`, `.cursor/mcp.json`, or `.zed/settings.json`) and lists **both** the `agentmark` (Cloud) server and the `agentmark-docs` (docs MCP) server
- [ ] Your MCP client lists tools from `agentmark-docs` (required — this workflow defers all integration content to it) and from `agentmark` (needed only for the optional Cloud step)
- [ ] *(Cloud features only)* Cloud auth resolves — `~/.agentmark/auth.json` exists OR `AGENTMARK_API_KEY` is set. **Do not block local setup on this**: installing packages, writing the client and prompt files, and running `agentmark dev` need no cloud auth at all. If auth is missing, proceed local-first and treat Cloud linking as the deferred final step.

If any are missing, tell the user to run `agentmark init` first (install the CLI with `npm install -g @agentmark-ai/cli` if it isn't available). Do not recreate those files from this workflow — that is the CLI's job, and duplicating it here is how the two paths drift apart.

## Step 1 — Detect the project (filesystem only)

Read the codebase with `Read` / `Glob` / `Grep`. The detection task is local; **do not call MCP tools here**. Identify:

- Language (TypeScript / Python / other) — from `package.json` / `pyproject.toml` / `requirements.txt`
- Framework name and major version (Next.js, Hono, FastAPI, Mastra, etc.)
- Existing prompts and LLM call sites — record locations; needed for Step 8. Look for **both**:
  - **Direct SDK calls**: `streamText`, `generateObject`, `client.messages.create`, `openai.chat.completions.create`, `anthropic.messages.create`, `openai.ChatCompletion`, …
  - **Framework prompt abstractions that hold the prompt** — equally migration targets, not just direct calls: LangChain `ChatPromptTemplate` / `PromptTemplate` (and the `.pipe(model)` / `.invoke(...)` chain that runs them), LlamaIndex `PromptTemplate`, agent-framework `instructions`, or a templated string assembled for an LLM call. A prompt living inside a framework template is exactly as much a "prompt to move into AgentMark" as a raw `messages: [...]` array — don't skip it because it doesn't look like a direct SDK call.
- Monorepo? Workspace boundaries? Identify the host workspace before deciding where AgentMark sits.

Then move to Step 2 — do not propose a placement from your detection alone.

## Step 2 — Fetch the integration page from the docs MCP

Query the docs MCP server for the integration guide. Try in this order:

1. `<framework> integration` (e.g. "Next.js integration")
2. `<framework> quickstart`
3. `running prompts` (`/build/running-prompts`) for in-process integration (Path A — the usual case), or `connect your SDK` (`/configure/connect-your-sdk`) for the Cloud-executor path (Path B)

**The neutral render is the universal path.** AgentMark has **no SDK-specific adapters** — whatever the host calls (Vercel AI SDK, the raw OpenAI/Anthropic client, AWS Bedrock `ConverseCommand`, a bespoke HTTP client), the integration is the same: render the prompt to AgentMark's neutral `{ messages, text_config }` and hand it to that SDK. Never escalate "no adapter exists" or default to a heavyweight custom-adapter page.

**Setting up AgentMark ALWAYS scaffolds the runnable trio: the client, `dev-entry.ts`, and `handler.ts`.** Do not treat the dev-entry as optional. `agentmark dev` boots from `dev-entry.ts`; it serves your prompt files on the local API server and executes them through your executor. The scaffolded client loads prompts via `ApiLoader.local(:9418)` — i.e. *from that dev server* — so **without `dev-entry.ts`, `agentmark dev` won't start, nothing local can load a prompt, and the Step 6 smoke (`agentmark doctor --smoke --boot`) fails with "Expected dev-entry.ts at your project root."** `handler.ts` is the same executor wired for cloud deploy. The per-SDK executor body is a copy-paste head start from the [connect-your-SDK guide](https://docs.agentmark.co/configure/connect-your-sdk.md); the full trio recipe is [`/getting-started/client-setup`](https://docs.agentmark.co/getting-started/client-setup.md).

**"Path A" vs "Path B" is about how the *host's application code* obtains a completion — NOT whether to build the dev-entry.** Path A (`createAgentMark` + `loadTextPrompt` + call your SDK in-process, [`/build/running-prompts`](https://docs.agentmark.co/build/running-prompts.md)) is how the user's own app runs a prompt; Path B (the cloud runs your prompt via the webhook) is how AgentMark Cloud executes it. Both still need the scaffolded dev-entry to run and verify locally. Wiring the host's existing call sites to Path A is the migration in Step 8 — it is additive to the trio, never a replacement for it.

Read the page in full. **The page is the authority on**:

- Which `@agentmark-ai/*` (or `agentmark-prompt-core` / `agentmark-sdk`) package to install
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

## Step 4 — Write files per the docs guidance

Place files at the paths the docs page specified. Two SDK-contract rules override convention (and are themselves documented at SKILL.md and in the docs):

- Prompts root is always **named `agentmark/`** — the SDK loader resolves `<agentmarkPath>/agentmark/`. Setting `agentmarkPath: "/"` instead of `"."` is a known footgun.
- The client file is a **configured factory** — reads `AGENTMARK_API_KEY` / `AGENTMARK_APP_ID` from env, exports a configured client. Importers throughout the codebase use it.

**`agentmark init` already scaffolds the client** (`agentmark.client.ts` / `agentmark_client.py`) — the provider-agnostic loader + evals file. **Keep it; do not rewrite it from scratch.** Read it, confirm it matches the docs, and only edit it to register real evals. What you DO still author are the two SDK-specific files: the `dev-entry.ts` dev-server entry and the `handler.ts` deployment entry, whose executor wraps *your* SDK call. For their full recipe, fetch `set up your AgentMark client` (Getting Started → Client setup) from the docs MCP and follow it verbatim, including its verification step (`agentmark dev` + `run-prompt`). The dashboard's Run buttons stay disabled until the client is deployed (or a webhook is set), so a Cloud-mode setup isn't complete without it.

**If you do touch the client, copy its imports exactly — do NOT consolidate them.** The two TypeScript symbols come from **different entry points**, and merging them is a silent, load-time-fatal mistake:

```ts
import { createAgentMark } from "@agentmark-ai/prompt-core";          // package root
import { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";     // ⚠️ subpath, NOT the root
```

`ApiLoader` is **not** exported from `@agentmark-ai/prompt-core` (the barrel deliberately omits loader plumbing for browser/worker consumers). If you import it from the root, `ApiLoader` is `undefined`, `ApiLoader.local(...)` throws `Cannot read properties of undefined (reading 'local')`, and the dev-entry crashes the instant `agentmark dev` loads it. Likewise `createExecutor` / `createWebhookRunner` come from the prompt-core root and `createWebhookServer` from `@agentmark-ai/cli/runner-server` — keep each import on the path the docs show.

If the docs guidance contradicts those two rules, prefer the docs (they may have evolved) but flag the discrepancy to the user.

## Step 5 — Scaffold the first prompt

One prompt only, named after the host's primary use case. **Read [creating-prompts.md](creating-prompts.md) and copy its frontmatter shape verbatim — do NOT author the frontmatter from memory** (that is how prompts end up with invalid shapes like `metadata.model.name` or a top-level `model`, which fail to parse). The model lives **inside** a `*_config` block (e.g. a `text_config` block with the model under its `model_name` key), never at the top level or under a `metadata`/`model` key; message tags are `<System>` / `<User>` / `<Assistant>` (not `<Human>`). After writing, run `agentmark doctor` to confirm the prompt parses (it names the fix if the shape is wrong), then regenerate types per the docs' instructions for the detected language (do not encode the command here).

## Step 6 — Smoke test (local — no cloud auth needed)

Verify the scaffold before handing back. Run `agentmark doctor` first: it statically checks `agentmark.json`, the client / dev-entry / handler files, prompts + `builtInModels`, and deps, and prints a concrete fix for anything wrong. Then boot the dev server and run an end-to-end check with `agentmark doctor --smoke`: it runs the prompt and confirms the emitted trace round-trips with the right shape (a model, token usage, input, output), which is the fastest way to catch a bad key, an SDK mismatch, or unwired tracing. Exact commands and flags via `agentmark <cmd> --help`. **Do not encode CLI surface in this workflow.** If anything fails, fix it (doctor names the fix) before handing back to the user.

**`doctor` passing is not "done."** It validates the scaffold, not whether the host's existing LLM code actually uses AgentMark. A green `doctor` means the wiring is correct — it does not mean there's nothing left to do. Do not report "all set" off a passing `doctor` alone; you still owe the user Step 8.

## Step 7 — Provision the Cloud app (optional, Cloud mode only)

Everything up to here runs **entirely locally** — no login, no cloud API. Only now, if `agentmark.json` has `handler` set or the user wants Cloud features (hosted dashboard, trace forwarding, managed experiments), provision via the `agentmark` MCP server. See [headless-with-mcp.md](headless-with-mcp.md) for the `create_app` + `mint_api_key` sequence. If cloud auth is missing or the user declines, **stop here with a working local setup** — never report local setup as blocked on login.

Write `AGENTMARK_API_KEY` and `AGENTMARK_APP_ID` to `.env` (create if absent; **never overwrite existing values without asking**). Confirm `.env` is in `.gitignore`. In Cloud mode, also confirm the trace appears via the `agentmark` MCP server's trace tools within a few seconds.

## Step 8 — Surface next steps, then offer migration (always)

This step is **mandatory** — the hand-back is not complete until you've done it. Reconcile the passing scaffold against what Step 1 found and tell the user explicitly which case they're in:

- **Step 1 found existing prompts** — direct SDK calls (`streamText` / `client.messages.create` / …) **or** framework prompt templates (a LangChain `ChatPromptTemplate`, a LlamaIndex `PromptTemplate`, etc.) → name them and offer to migrate (below). A prompt held in a framework template counts: it is still "your prompt living in code," just wrapped in that framework's abstraction.
- **Step 1 found no existing prompts or LLM call sites** → say so plainly ("no existing LLM calls to migrate — you're ready to write prompts") so "done" is a stated conclusion, not a silent stop.

Either way the user must hear where things stand. The failure mode this guards against: scaffolding, watching `doctor` pass, and reporting "all done" while leaving the user's actual AI code still calling the provider directly — they never learn migration was the next move.

When there are call sites, **do not migrate them as part of setup**. Setup ends at Step 6 (Step 7 only when the user wants Cloud). Migration is a separate confirmation:

> Setup is done and `doctor` passes. I noticed 3 places that call the AI SDK directly. Want me to migrate those to load AgentMark prompts? I'll preserve inputs/outputs and open it as a separate change so it's easy to review.

Migration is a refactor with its own risk profile. Conflating it with setup makes review harder and inflates blast radius — but skipping the *offer* is how setup silently stops half-done.

**When you DO migrate (the user asked, or pre-authorized it — e.g. "move my existing prompt into AgentMark"), migration is only complete when the ORIGINAL call site loads from AgentMark.** Creating a new `.prompt.mdx` beside an untouched call site is **duplication, not migration** — now the prompt lives in two places and the app still runs the old copy. A prompt held inside a framework template (a LangChain `ChatPromptTemplate`, a LlamaIndex `PromptTemplate`) is a migration target just like an inline call — don't skip it because it isn't a raw `messages: [...]` array. For every call site:

1. Move the prompt text into a `.prompt.mdx` (system/user/assistant turns; the template variables become `{props.*}`).
2. **Rewrite the call site** to load it: `const prompt = await client.loadTextPrompt("<name>"); const { messages } = await prompt.format({ props });` then feed `messages` to whatever runs the model.
3. **Keep the host's existing model call** — you are replacing *where the prompt comes from*, not the SDK. A LangChain `ChatPromptTemplate.fromMessages([...]).pipe(model).invoke(vars)` becomes: load + `format(vars)` from AgentMark, then `model.invoke(messages)` (LangChain chat models accept a message array directly). Same for a Vercel-AI/raw-SDK call — swap the inline prompt for the loaded one, leave the `generateText`/`create` call.
4. Verify the original template/inline prompt string is **gone** from the call site (no leftover duplicate), the function signature is unchanged, and `agentmark doctor` still passes.

If you only see a path to create the prompt but not to rewire a particular call site (an unusual chain, generated code), say so explicitly rather than silently leaving a duplicate.

## Common mistakes

- **Encoding integration content into this workflow.** Paths, packages, CLI flags, framework recommendations — all of those live in the docs. Drift between skill and docs is how agents end up recommending stale packages. Always defer to the docs MCP.
- **Skipping the docs-MCP query** because you "remember" how Next.js / FastAPI / Mastra setup works. Your memory is wrong; the docs are right.
- **Inventing a path or package when no docs page covers the framework.** Stop and tell the user. The escalation is to ask whether to use the closest covered pattern as a starting point — not to guess.
- **Recreating `agentmark.json` or MCP config files from this workflow** — that's the CLI's job. If those files are missing, send the user back to `agentmark init`.
- **Calling the `agentmark` (Cloud) MCP server for project detection** — that server is for AgentMark Cloud, not local file inspection. Use `Read` / `Glob` / `Grep`.
- **Migrating existing LLM code without a second confirmation.** Setup consent ≠ refactor consent.
- **Reporting "all done" off a passing `doctor` without surfacing Step 8.** A green `doctor` validates the scaffold, not that the host's code uses AgentMark. Always close by stating the migration status (call sites to migrate, or none) — never let a passing check be the silent end of the conversation.
- **Hunting for an "adapter," or defaulting to the custom-adapter page.** There are no SDK-specific adapters — every SDK integrates through the neutral render. Route to Path A (lightweight, no executor — [`/build/running-prompts`](https://docs.agentmark.co/build/running-prompts.md)) or Path B (`createExecutor`, cloud-executed — [`/configure/connect-your-sdk`](https://docs.agentmark.co/configure/connect-your-sdk.md)). A full custom adapter only earns its keep when you want AgentMark to own the provider request shape — rarely what these users need.
