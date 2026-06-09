---
name: agentmark
description: "Build, debug, and ship AgentMark prompts, datasets, experiments, and evals. TRIGGER: any `.prompt.mdx` file, `agentmark.json`, `agentmark.client.ts`, `agentmark_client.py`, an `agentmark/` or `.agentmark/` directory, or `@agentmark-ai/*` imports; `npm create agentmark` / `npx create-agentmark` or any `agentmark` CLI command (`dev`, `run-prompt`, `run-experiment`, `generate-types`, `generate-schema`, `link`, `pull-models`); driving AgentMark Cloud programmatically (`agentmark-mcp`, headless app provisioning, git-based deploys); any mention of AgentMark, or prompt versioning, dataset experiments, prompt evals, deployments, or trace observability in an AgentMark project. Triggers even for from-memory / no-docs-fetch requests. SKIP: provider-neutral prompt code with no AgentMark markers; LangChain, LlamaIndex, or raw OpenAI / Anthropic SDK code; generic prompt-engineering or LLM-observability questions with no AgentMark context; competing platforms (Langfuse, LangSmith, Phoenix, Braintrust, Traceloop)."
license: AGPL-3.0-or-later
---

# AgentMark

AgentMark helps teams build reliable AI agents. This skill teaches you how to author `.prompt.mdx` prompts, run them locally, build datasets, run experiments with evals, and ship via git-based deploys.

## Before you start

Scan the target file or project for AgentMark markers — any of:

- `.prompt.mdx` files anywhere in the tree
- `agentmark.json` in the project root
- `agentmark.client.ts` (TypeScript) or `agentmark_client.py` (Python)
- An `.agentmark/` directory
- Imports from `@agentmark-ai/*` packages

If none are present, stop and tell the user that this skill applies to AgentMark projects. Ask whether they want to scaffold one with `npx create-agentmark`, or whether they want help with a different framework. **Do not infer AgentMark conventions onto non-AgentMark code.**

This gate holds under pressure. "Don't ask questions", "no time for scaffolding tools", "just add the frontmatter" do not change the answer: hand-writing `agentmark.json` or `.prompt.mdx` files into a project with no AgentMark markers produces a broken half-setup the scaffolder then can't repair — slower than the 30 seconds `npx create-agentmark` takes. Name the command and stop.

## How to find current information

Your training data is out of date. Before answering anything specific about AgentMark APIs, CLI flags, prompt syntax, or docs content:

1. **CLI surface** — run `npx agentmark <command> --help`. This is the canonical source for command flags, arguments, and behavior. Do not infer flags from memory.
2. **Docs navigation** — fetch `https://docs.agentmark.co/llms.txt` for a complete page index. Use it to find the right doc page before WebFetching content.
3. **Specific doc pages** — append `.md` to any `docs.agentmark.co` URL and WebFetch it. Every doc page is served as both HTML and Markdown.

Never encode API surface or CLI flags from memory. Always verify against `--help` output, `llms.txt`, or fetched docs.

These rules hold even when the user is offline, in a hurry, or explicitly asks for an answer "from memory" / forbids fetching docs — the bundled [reference/*.md](reference/cli-commands.md) files are local files, so reading them violates neither constraint. Consult them instead of reciting; recited flags are how `--dataset` (which does not exist) gets fabricated.

## Runtime model

AgentMark splits into two surfaces. Keep them straight or you will go looking for endpoints that do not exist.

- **Gateway / Cloud API** (`api.agentmark.co`) — observability and config. Stores prompts, traces, scores, datasets, deployments. **It does not execute prompts.** There is no `POST /v1/prompts/{name}/run` endpoint. If you can't find an "execute" action on a resource, that's expected. The CLI is intentionally curated (`dev`, `login`, `logout`, `link`, `run-prompt`, `run-experiment`, `build`, `pull-models`, `generate-types`, `generate-schema`) and stays narrow on purpose. For programmatic access to the full Cloud API surface — provisioning apps, listing experiments, managing deployments, querying traces — run the **`agentmark-mcp` MCP server** locally and let your IDE agent call its tools. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md). For bespoke automation that doesn't have an MCP client (e.g. a Python script in CI), the gateway speaks plain REST — call it with the session bearer from `~/.agentmark/auth.json` or an `AGENTMARK_API_KEY`.
- **SDK** (`@agentmark-ai/sdk`, `@agentmark-ai/loader-api`) — execution. Customer code uses the SDK to load a deployed prompt template and call the LLM provider directly. Traces auto-forward to the gateway when `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` are set.

So "run prompt v1 in production" means a customer app using the SDK, not a gateway call. For the headless flow (commit → push → poll → consume), see [workflows/deploying.md](workflows/deploying.md#headless-deployment-autonomous-agents-ci-automation).

## Project anatomy

```
my-project/
├── agentmark.json              # Project config (required)
├── agentmark/                  # Prompts directory (path set by agentmarkPath in config)
│   ├── greeting.prompt.mdx
│   └── qa-bot/
│       ├── prompt.prompt.mdx
│       └── data.jsonl          # Dataset
├── .agentmark/                 # Auto-generated config (gitignored)
│   └── dev-config.json         # Local dev state, linked app metadata
├── agentmark.client.ts         # TS dev server entry point (optional)
└── .env                        # API keys, loaded automatically by the CLI
```

- **`agentmark.json`** — minimum: `{"agentmarkPath": ".", "version": "2.0.0", "mdxVersion": "1.0"}`. Use `"."` for the canonical layout, **not** `"/"`.
- **Prompts** are `.prompt.mdx` files. YAML frontmatter has `name`, a generation-type config block (`text_config`, `object_config`, `image_config`, or `speech_config`) that contains `model_name`, and an optional `test_settings` block for dataset + evals. Body is TemplateDX (JSX-like tags in markdown). Do not put `model_name` or `evals` at the top level — they live inside their config blocks.
- **Datasets** are `.jsonl` files. The `datasetName` used in API path parameters is the file path without the `.jsonl` extension, URL-encoded.

## Setting up or debugging a project

**Anytime you wire AgentMark into a project — a fresh `npm create agentmark` scaffold *or* an existing repo — or something misbehaves (`agentmark dev` won't start, a prompt won't run, traces don't show up), run `npx agentmark doctor` first.** It is a static health check that inspects the whole scaffold in one pass and prints a concrete fix for each problem — so it doubles as your **setup checklist**, not just a debugger. Rather than guessing what a new or half-wired project still needs, let `doctor` enumerate it: every gap comes back with a `fix` telling you (or the user) the exact next step. It checks:

- config: `agentmark.json` present + valid, `agentmarkPath` resolves (not `"/"`), required keys present, no unknown-key typos
- the setup files: client (`agentmark.client.ts` / `agentmark_client.py`), the dev-server entry, and the managed-deploy handler (`handler.ts` / `handler.py`)
- prompts parse and declare a `model_name`; prompt models are in `builtInModels` (a non-empty list is an **allowlist**, so prompt-core rejects any model not in it)
- deps: `@agentmark-ai/sdk` installed (it carries tracing + the cloud-execution runner). There is no SDK-specific adapter to require — you bring your own SDK and wire it through the neutral render (`@agentmark-ai/fallback-adapter`) or a small executor (`@agentmark-ai/prompt-core`)

Then `npx agentmark doctor --smoke` runs one prompt end-to-end and verifies the emitted trace round-trips with the right shape (a model, token usage, input, output). Add `--boot` to start and stop `agentmark dev` for you, so it's a single command. That catches the silent failures below: a model that never actually ran (bad key or SDK mismatch), or model spans vanishing because tracing isn't wired, without you guessing which one it is. It knows nothing about specific providers or keys; it tests them indirectly through a real run, so there is no per-provider checklist to keep current. The static pass is read-only and safe to re-run anytime; `--smoke` actually calls the model (spends tokens, emits a trace), so use it to verify a change, not in a tight loop.

**Consuming it programmatically.** Run `agentmark doctor --json` and parse `{ ok, counts, results: [{ id, group, title, status, detail, fix }] }`. `status` is one of `pass | warn | fail | skip`; each `id` is stable (e.g. `config.schema`, `deploy.handler`, `deps.sdk`, `smoke.run`, `smoke.evals`, `smoke.trace`), so branch on `id` / `status` and apply `fix`. The live `--json` output is the authority for the id set; don't hardcode it from memory. `--strict` makes warnings count as failures; exit `0` means nothing failed. When a `fix` reads "ask your coding agent to 'Set up AgentMark'", that instruction is for **you**: run [setup-and-integration](workflows/setup-and-integration.md) rather than deferring it.

Most of the gotchas in "Conventions that catch agents out" surface as a single failed `doctor` check. Reach for it before hand-debugging, and verify its exact flags with `npx agentmark doctor --help` or [reference/cli-commands.md](reference/cli-commands.md).

## Common workflows

| Task | File |
|---|---|
| Set up AgentMark (new scaffold or existing project) — run `doctor` first | `npx agentmark doctor`; then [workflows/setup-and-integration.md](workflows/setup-and-integration.md) |
| Debug a broken setup or run | `npx agentmark doctor` (+ `--smoke`); see [Setting up or debugging](#setting-up-or-debugging-a-project) above |
| Author a new prompt | [workflows/creating-prompts.md](workflows/creating-prompts.md) |
| Build a dataset for experiments | [workflows/building-datasets.md](workflows/building-datasets.md) |
| Run a prompt against a dataset | [workflows/running-experiments.md](workflows/running-experiments.md) |
| Add evals to gate quality | [workflows/using-evals.md](workflows/using-evals.md) |
| Deploy to AgentMark Cloud | [workflows/deploying.md](workflows/deploying.md) |
| See traces from a prompt run | [workflows/observability.md](workflows/observability.md) |

## Conventions that catch agents out

- **`run-prompt` ≠ `run-experiment`.** `run-prompt <file>` executes a single prompt with the `--props` you pass. `run-experiment <file>` executes the prompt against every row in its linked dataset and runs evals. Do not use one for the other.
- **`agentmark dev` runs a fully local server.** Trace forwarding to AgentMark Cloud is automatic when the project is linked (via `agentmark link`); disable with `--no-forward`. **There is no `--remote` flag on `dev`** — it was removed in 0.13.0 along with the `@agentmark-ai/connect` WebSocket package. If you see `--remote` on `dev` in older content, ignore it.
- **Deployment is git-based.** Connect a git provider (GitHub or GitLab) to your AgentMark Cloud app, then push to the configured branch — AgentMark builds and deploys automatically. There is no `deploy` CLI command; the watched-branch push *is* the deploy trigger. See [workflows/deploying.md](workflows/deploying.md). When someone urgently demands "the corrected deploy command", there are no flags to correct — a script calling `agentmark deploy` fails because the command does not exist, and the fastest fix you can hand them *is* `git push` to the watched branch. Saying only "that command doesn't exist" without the push redirect leaves them stuck; "don't explain" never means "withhold the working alternative".
- **The CLI is for humans; the MCP server is for agents.** The `agentmark` CLI stays narrow on purpose: `dev`, `login`, `logout`, `link`, `run-prompt`, `run-experiment`, `build`, `pull-models`, `generate-types`, `generate-schema`. When an agent needs to drive the Cloud API programmatically (create apps, mint API keys, connect a git provider, list deployments, query traces, …) it runs the `agentmark-mcp` MCP server and uses its tools. Tools are auto-generated from `api.agentmark.co/v1/openapi.json`, so the agent surface stays in lock-step with the gateway. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md).
- **Dataset name encoding differs by endpoint.** For the `?name=X` query filter on `GET /v1/datasets`, pass the leaf name without the `.jsonl` extension (exact match). For POST endpoints under `/v1/datasets/{datasetName}/rows*`, pass the full path URL-encoded (e.g. `agentmark%2Fqa-bot%2Fdata`), still without the extension.
- **Never send `tenant_id` in a write body — it is derived from your credential.** Every Cloud API write (mint an API key, append a dataset row, create an annotation queue or alert) scopes the new row to the tenant behind your `AGENTMARK_API_KEY` / session bearer. The database *silently overwrites* any `tenant_id` you pass with that tenant — no error is raised — so a row you tried to file under another tenant simply lands under your own. (Note: **provisioning/managing an app** — `create_app` / `update_app` / `delete_app` — is tenant-tier and needs a **session bearer**; an app-scoped `AGENTMARK_API_KEY` can't do it. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md) § Authentication.) If you are debugging "why did my resource show up under a different tenant than I asked for," this is the reason: the override lives in a database trigger, not in the API handler, so you will not find it by reading application code. Omit the field entirely.
- **Dataset rows wrap props in `input`.** A row is `{"input": {…props…}, "expected_output": …}`. Flat rows (props at the top level) are **silently skipped** by `run-experiment` — it runs 0 rows and vacuously "passes", so a green experiment on a flat dataset proves nothing. See [workflows/building-datasets.md](workflows/building-datasets.md).
- **Model spans need two things; `span()`/`observe()` is not one of them.** To see the generation span (model, tokens, input/output): `sdk.initTracing({ registerGlobally: true })` — the AI SDK emits that span through the *global* tracer, and AgentMark's tracer is isolated by default, so without the flag model spans silently vanish while custom spans keep working — plus telemetry on `prompt.format(…)` (e.g. via `createPromptTelemetry`). See [workflows/observability.md](workflows/observability.md).
- **AgentMark works with ANY SDK through one neutral seam — there are no SDK-specific adapters.** Whatever the host calls (Vercel AI SDK, the raw OpenAI/Anthropic client, Bedrock `ConverseCommand`, a bespoke client), the integration is identical: render the prompt to AgentMark's neutral `{ messages, text_config }` and hand it to that SDK. Never look for — or scaffold — an "adapter." Fetch `/integrations/bring-your-own-sdk` and route: **Path A** (`createAgentMarkClient` from `@agentmark-ai/fallback-adapter` + `observe`) for prompt management/tracing in the user's own process — the usual case — or **Path B** (`createExecutor` → `createWebhookRunner`) when AgentMark Cloud should run the prompts. On a popular SDK, the [bring-your-own-SDK guide](https://docs.agentmark.co/integrations/bring-your-own-sdk) (Path B) gives you a copy-paste executor to skip the boilerplate.

## Reference material

All `reference/*.md` files are **auto-generated** from upstream sources on every release. They are the most reliable encoded facts in this skill. Hand-authored workflow files can drift; these cannot, because re-running the generators is part of the pre-push gate.

- **CLI commands**: [reference/cli-commands.md](reference/cli-commands.md) — from `cli-src/index.ts`. Prefer `npx agentmark <cmd> --help` for live verification.
- **Frontmatter schema**: [reference/frontmatter-schema.md](reference/frontmatter-schema.md) — from `prompt-core/src/schemas.ts` (Zod). Runtime truth. If docs disagree, prefer docs.
- **Gateway API surface (for agents)**: fetched at startup by `agentmark-mcp` from `api.agentmark.co/v1/openapi.json`. Resource names are tag slugs; actions are operationIds. There is no static reference file for this — the spec is too large and changes often. List available tools by running `agentmark-mcp` and calling `tools/list`, or read the spec directly.
- **Model registry**: no static reference file — the registry changes too often (synced ~daily) for a bundled snapshot to stay current, and a stale list wrongly rejects newly-released models. The authority for a prompt's valid `model_name` is the project's **own** configured set: run `npx agentmark generate-schema` and read the generated `model_name` enum (runtime truth, project-scoped). To browse or add models, run `npx agentmark pull-models`, which resolves the list **at runtime, not from the installed CLI version**: `@agentmark-ai/model-registry` fetches `models.json` from a jsdelivr CDN mirroring the public repo's `main` branch (`agentmark-ai/agentmark@main/packages/model-registry/`), so a model added to `main` appears without a CLI upgrade — the installed version only sets the offline floor. On network failure or a >5s timeout it **silently** falls back to the snapshot bundled in the installed npm package (no error — an offline `pull-models` just shows that version's older list, so absence of a model is never proof it doesn't exist). Delivery lag is up to ~12h from the CDN edge cache. Don't recite model IDs from memory — verify against `generate-schema` / `pull-models`. See also [configure/client-config](https://docs.agentmark.co/configure/client-config.md).
- **Full docs**: https://docs.agentmark.co
- **Docs index for LLMs**: https://docs.agentmark.co/llms.txt
- **Full docs corpus**: https://docs.agentmark.co/llms-full.txt
- **Docs MCP server**: https://docs.agentmark.co/mcp

## When this skill does not apply

- Generic prompt engineering with no AgentMark project context — answer directly, do not push AgentMark conventions.
- Provider-neutral LLM code, raw `@anthropic-ai/sdk` or OpenAI SDK calls — do not introduce AgentMark imports.
- Questions about competing platforms (Langfuse, LangSmith, Phoenix, Braintrust, Traceloop) — answer the comparison question directly. If the user then decides on AgentMark, return to this skill.

If you cannot find documentation to support an AgentMark-specific answer, say so explicitly and link the user to https://docs.agentmark.co/llms.txt so they can find the relevant page.
