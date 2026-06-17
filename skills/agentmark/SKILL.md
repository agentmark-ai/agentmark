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

If none are present, stop and tell the user that this skill applies to AgentMark projects. Ask whether they want to scaffold one with `agentmark init`, or whether they want help with a different framework. **Do not infer AgentMark conventions onto non-AgentMark code.**

This gate holds under pressure. "Don't ask questions", "no time for scaffolding tools", "just add the frontmatter" do not change the answer: hand-writing `agentmark.json` or `.prompt.mdx` files into a project with no AgentMark markers produces a broken half-setup the scaffolder then can't repair — slower than the 30 seconds `agentmark init` takes. Name the command and stop.

## Ensure the `agentmark` CLI is installed

This skill drives the `agentmark` CLI directly — `agentmark init`, `agentmark dev`, `agentmark doctor`, and the rest are written as bare commands that assume a global install. Before running any of them, confirm it resolves:

```bash
agentmark --version
```

If that fails (`command not found`), the user has not installed the CLI globally. **Stop and ask them to install it**, then continue once it resolves:

```bash
npm install -g @agentmark-ai/cli
```

Install once and every command in this skill runs verbatim. (A one-off `npx @agentmark-ai/cli <cmd>` also works without installing, but the global install is the intended path — prefer it.)

> ⚠️ **The CLI's npm package is the scoped `@agentmark-ai/cli` — the unscoped `agentmark` package on npm is unrelated.** Never install or invoke it by the bare name:
> - install with `npm install -g @agentmark-ai/cli` — **not** `npm install -g agentmark`
> - one-off runs use `npx @agentmark-ai/cli <cmd>` — **not** `npx agentmark <cmd>` (that downloads and runs the wrong package)
> - or use the project-pinned `npm run agentmark:dev` that `agentmark init` wires up
>
> The bare `agentmark` *command* is correct only as the binary the scoped package installs (globally or in `node_modules/.bin`). If `agentmark --version` resolves but `init` / `dev` / `doctor` are unknown commands, the wrong `agentmark` is installed — reinstall `@agentmark-ai/cli`.

## How to find current information

Your training data is out of date. Before answering anything specific about AgentMark APIs, CLI flags, prompt syntax, or docs content, use this lookup order. **This is the single doc-lookup precedence for the whole skill — every workflow defers here; don't invent a different order.** The docs are the one source of truth; each step below is just a way to read *them*.

1. **CLI surface** — run `agentmark <command> --help`. Canonical for command flags, arguments, and behavior. Never infer flags from memory.
2. **Orient first** — fetch `https://docs.agentmark.co/llms.txt`, the machine-readable index of every doc page, and pick the *right* page before reading content. Orienting here is what stops you authoring from memory (the cause of invalid prompt shapes like `<Human>` or `metadata.model.name`).
3. **Read the page as Markdown** — append `.md` to its `docs.agentmark.co` URL and `WebFetch` it. Markdown is served for every page and is markedly cheaper in tokens than HTML; this is the primary way to read doc content.
4. **Search fallback** — only if `llms.txt` doesn't surface the right page, query the docs MCP server (`https://docs.agentmark.co/mcp`), which searches the same docs and returns the matching page. The MCP is an interface *over* the docs, not a separate source.
5. **Offline only** — if the network is blocked, the bundled [reference/*.md](reference/cli-commands.md) files are local and auto-generated (version-matched to this skill). Read them instead of reciting — but they are a last-resort fallback, and the live docs win if they ever disagree.

Never encode API surface, CLI flags, or prompt syntax from memory — recited flags are how `--dataset` (which does not exist) gets fabricated. If two sources disagree, the live docs win.

## Runtime model

AgentMark splits into two surfaces. Keep them straight or you will go looking for endpoints that do not exist.

- **Gateway / Cloud API** (`api.agentmark.co`) — observability and config. Stores prompts, traces, scores, datasets, deployments. **It does not execute prompts.** There is no `POST /v1/prompts/{name}/run` endpoint. If you can't find an "execute" action on a resource, that's expected. The CLI is intentionally curated (`dev`, `login`, `logout`, `link`, `run-prompt`, `run-experiment`, `build`, `pull-models`, `generate-types`, `generate-schema`) and stays narrow on purpose. For programmatic access to the full Cloud API surface — provisioning apps, listing experiments, managing deployments, querying traces — run the **`agentmark-mcp` MCP server** locally and let your IDE agent call its tools. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md). For bespoke automation that doesn't have an MCP client (e.g. a Python script in CI), the gateway speaks plain REST — call it with the session bearer from `~/.agentmark/auth.json` or an `AGENTMARK_API_KEY`.
- **SDK** (`@agentmark-ai/sdk`; `ApiLoader` ships in `@agentmark-ai/prompt-core/loader-api`) — execution. Customer code uses the SDK to load a deployed prompt template and call the LLM provider directly. Traces auto-forward to the gateway when `AGENTMARK_API_KEY` + `AGENTMARK_APP_ID` are set.

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
├── agentmark.client.ts         # TS AgentMark client (loader + evals)
├── dev-entry.ts                # Local dev webhook entry — `agentmark dev` boots this
├── handler.ts                  # Cloud deployment entry
└── .env                        # API keys, loaded automatically by the CLI
```

- **`agentmark.json`** — minimum: `{"agentmarkPath": ".", "version": "2.0.0", "mdxVersion": "1.0"}`. Use `"."` for the canonical layout, **not** `"/"`.
- **Prompts** are `.prompt.mdx` files. YAML frontmatter has `name`, a generation-type config block (`text_config`, `object_config`, `image_config`, or `speech_config`) that contains `model_name`, and an optional `test_settings` block for dataset + evals. Body is TemplateDX (JSX-like tags in markdown). Do not put `model_name` or `evals` at the top level — they live inside their config blocks.
- **Datasets** are `.jsonl` files. The `datasetName` used in API path parameters is the file path without the `.jsonl` extension, URL-encoded.

## Setting up or debugging a project

**Anytime you wire AgentMark into a project — a fresh `agentmark init` scaffold *or* an existing repo — or something misbehaves (`agentmark dev` won't start, a prompt won't run, traces don't show up), run `agentmark doctor` first.** It is a static health check that inspects the whole scaffold in one pass and prints a concrete fix for each problem — so it doubles as your **setup checklist**, not just a debugger. Rather than guessing what a new or half-wired project still needs, let `doctor` enumerate it: every gap comes back with a `fix` telling you (or the user) the exact next step. It checks:

- config: `agentmark.json` present + valid, `agentmarkPath` resolves (not `"/"`), required keys present, no unknown-key typos
- the setup files: client (`agentmark.client.ts` / `agentmark_client.py`), the dev-server entry, and the managed-deploy handler (`handler.ts` / `handler.py`)
- prompts parse and declare a `model_name`; prompt models are in `builtInModels` (a non-empty list is an **allowlist**, so prompt-core rejects any model not in it)
- deps: `@agentmark-ai/sdk` installed (it carries tracing + the cloud-execution runner). There is no SDK-specific adapter to require — you bring your own SDK and wire it through `@agentmark-ai/prompt-core` — the neutral render (`createAgentMark`) or a small executor (`createExecutor`)

Then `agentmark doctor --smoke` runs one prompt end-to-end and verifies the emitted trace round-trips with the right shape (a model, token usage, input, output). Add `--boot` to start and stop `agentmark dev` for you, so it's a single command. That catches the silent failures below: a model that never actually ran (bad key or SDK mismatch), or model spans vanishing because tracing isn't wired, without you guessing which one it is. It knows nothing about specific providers or keys; it tests them indirectly through a real run, so there is no per-provider checklist to keep current. The static pass is read-only and safe to re-run anytime; `--smoke` actually calls the model (spends tokens, emits a trace), so use it to verify a change, not in a tight loop.

**Consuming it programmatically.** Run `agentmark doctor --json` and parse `{ ok, counts, results: [{ id, group, title, status, detail, fix }] }`. `status` is one of `pass | warn | fail | skip`; each `id` is stable (e.g. `config.schema`, `deploy.handler`, `deps.sdk`, `smoke.run`, `smoke.evals`, `smoke.trace`), so branch on `id` / `status` and apply `fix`. The live `--json` output is the authority for the id set; don't hardcode it from memory. `--strict` makes warnings count as failures; exit `0` means nothing failed. When a `fix` reads "ask your coding agent to 'Set up AgentMark'", that instruction is for **you**: run [setup-and-integration](workflows/setup-and-integration.md) rather than deferring it.

Most of the gotchas in "Conventions that catch agents out" surface as a single failed `doctor` check. Reach for it before hand-debugging, and verify its exact flags with `agentmark doctor --help` or [reference/cli-commands.md](reference/cli-commands.md).

## Common workflows

| Task | File |
|---|---|
| Set up AgentMark (new scaffold or existing project) — run `doctor` first | `agentmark doctor`; then [workflows/setup-and-integration.md](workflows/setup-and-integration.md) |
| Debug a broken setup or run | `agentmark doctor` (+ `--smoke`); see [Setting up or debugging](#setting-up-or-debugging-a-project) above |
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
- **Trace-level input/output is derived, never executor-set.** A trace's input/output (trace list, trace detail, `doctor --smoke`'s traceShape check) is derived at read time: the root prompt-run span's `agentmark.input`/`agentmark.output` (written automatically by the WebhookRunner) wins, falling back to the first/last GENERATION span. If a trace is missing I/O, fix the instrumentation (model SDK not emitting GENERATION spans) or update the runner — do NOT add span attributes in an executor; executors don't own that boundary. See [workflows/observability.md](workflows/observability.md) § Where trace-level input/output come from.
- **AgentMark works with ANY SDK through one neutral seam — there are no SDK-specific adapters.** Whatever the host calls (Vercel AI SDK, the raw OpenAI/Anthropic client, Bedrock `ConverseCommand`, a bespoke client), the integration is identical: render the prompt to AgentMark's neutral `{ messages, text_config }` and hand it to that SDK. Never look for — or scaffold — an "adapter." There are two routes, now split across two docs pages: **Path A** (`createAgentMark` + `loadTextPrompt` + `observe`) for prompt management/tracing in the user's own process — the usual case, documented at [`/build/running-prompts`](https://docs.agentmark.co/build/running-prompts.md) — or **Path B** (`createExecutor` → `createWebhookRunner({ client, executor })`, wired and served per [`/getting-started/client-setup`](https://docs.agentmark.co/getting-started/client-setup.md)) when AgentMark Cloud should run the prompts. On a popular SDK, the [connect-your-SDK guide](https://docs.agentmark.co/configure/connect-your-sdk.md) (Path B) gives you a copy-paste executor to skip the boilerplate.

## Reference material

All `reference/*.md` files are **auto-generated** from upstream sources on every release. They are the most reliable encoded facts in this skill. Hand-authored workflow files can drift; these cannot, because re-running the generators is part of the pre-push gate.

- **CLI commands**: [reference/cli-commands.md](reference/cli-commands.md) — from `cli-src/index.ts`. Prefer `agentmark <cmd> --help` for live verification.
- **Frontmatter schema**: [reference/frontmatter-schema.md](reference/frontmatter-schema.md) — from `prompt-core/src/schemas.ts` (Zod). Runtime truth. If docs disagree, prefer docs.
- **Gateway API surface (for agents)**: fetched at startup by `agentmark-mcp` from `api.agentmark.co/v1/openapi.json`. Resource names are tag slugs; actions are operationIds. There is no static reference file for this — the spec is too large and changes often. List available tools by running `agentmark-mcp` and calling `tools/list`, or read the spec directly.
- **Model registry**: no static reference file — the registry changes too often (synced ~daily) for a bundled snapshot to stay current, and a stale list wrongly rejects newly-released models. The authority for a prompt's valid `model_name` is the project's **own** configured set: run `agentmark generate-schema` and read the generated `model_name` enum (runtime truth, project-scoped). To browse or add models, run `agentmark pull-models`, which resolves the list **at runtime, not from the installed CLI version**: `@agentmark-ai/model-registry` fetches `models.json` from a jsdelivr CDN mirroring the public repo's `main` branch (`agentmark-ai/agentmark@main/packages/model-registry/`), so a model added to `main` appears without a CLI upgrade — the installed version only sets the offline floor. On network failure or a >5s timeout it **silently** falls back to the snapshot bundled in the installed npm package (no error — an offline `pull-models` just shows that version's older list, so absence of a model is never proof it doesn't exist). Delivery lag is up to ~12h from the CDN edge cache. Don't recite model IDs from memory — verify against `generate-schema` / `pull-models`. See also [configure/client-config](https://docs.agentmark.co/configure/client-config.md).
- **Full docs**: https://docs.agentmark.co
- **Docs index for LLMs**: https://docs.agentmark.co/llms.txt
- **Full docs corpus**: https://docs.agentmark.co/llms-full.txt
- **Docs MCP server**: https://docs.agentmark.co/mcp

## When this skill does not apply

- Generic prompt engineering with no AgentMark project context — answer directly, do not push AgentMark conventions.
- Provider-neutral LLM code, raw `@anthropic-ai/sdk` or OpenAI SDK calls — do not introduce AgentMark imports.
- Questions about competing platforms (Langfuse, LangSmith, Phoenix, Braintrust, Traceloop) — answer the comparison question directly. If the user then decides on AgentMark, return to this skill.

If you cannot find documentation to support an AgentMark-specific answer, say so explicitly and link the user to https://docs.agentmark.co/llms.txt so they can find the relevant page.
