---
name: agentmark
description: "Build, debug, and ship AgentMark prompts, datasets, experiments, and evals. TRIGGER when: working with `.prompt.mdx` files, `agentmark.json`, `agentmark.client.ts`, `agentmark_client.py`, an `agentmark/` or `.agentmark/` directory, or imports from `@agentmark-ai/*`; user says any of \"set up AgentMark in this project\", \"wire AgentMark into my app\", \"integrate AgentMark\", \"run an AgentMark experiment\", \"create an AgentMark prompt\", \"deploy an AgentMark prompt\", or runs `npm create agentmark` / `npx create-agentmark`; user runs or asks about `agentmark <cmd>` / `npx agentmark <cmd>` (`dev`, `run-prompt`, `run-experiment`, `build`, `generate-types`, `generate-schema`, `link`, `login`, `logout`, `pull-models`); user asks about driving AgentMark Cloud programmatically (the `agentmark-mcp` server, MCP tools, headless app provisioning, git-based deploys); user mentions AgentMark or asks about prompt versioning, dataset experiments, prompt evaluations, prompt deployments, or trace observability in an AgentMark project. SKIP: provider-neutral prompt code with no AgentMark markers; LangChain / LlamaIndex / raw OpenAI / Anthropic SDK code; questions about prompt engineering or LLM observability in general with no AgentMark context; questions about competing platforms (Langfuse, LangSmith, Phoenix, Braintrust, Traceloop)."
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

## How to find current information

Your training data is out of date. Before answering anything specific about AgentMark APIs, CLI flags, prompt syntax, or docs content:

1. **CLI surface** — run `npx agentmark <command> --help`. This is the canonical source for command flags, arguments, and behavior. Do not infer flags from memory.
2. **Docs navigation** — fetch `https://docs.agentmark.co/llms.txt` for a complete page index. Use it to find the right doc page before WebFetching content.
3. **Specific doc pages** — append `.md` to any `docs.agentmark.co` URL and WebFetch it. Every doc page is served as both HTML and Markdown.

Never encode API surface or CLI flags from memory. Always verify against `--help` output, `llms.txt`, or fetched docs.

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

## Common workflows

| Task | File |
|---|---|
| Set up AgentMark in an existing project (after `npm create agentmark`) | [workflows/setup-and-integration.md](workflows/setup-and-integration.md) |
| Author a new prompt | [workflows/creating-prompts.md](workflows/creating-prompts.md) |
| Build a dataset for experiments | [workflows/building-datasets.md](workflows/building-datasets.md) |
| Run a prompt against a dataset | [workflows/running-experiments.md](workflows/running-experiments.md) |
| Add evals to gate quality | [workflows/using-evals.md](workflows/using-evals.md) |
| Deploy to AgentMark Cloud | [workflows/deploying.md](workflows/deploying.md) |
| See traces from a prompt run | [workflows/observability.md](workflows/observability.md) |

## Conventions that catch agents out

- **`run-prompt` ≠ `run-experiment`.** `run-prompt <file>` executes a single prompt with the `--props` you pass. `run-experiment <file>` executes the prompt against every row in its linked dataset and runs evals. Do not use one for the other.
- **`agentmark dev` runs a fully local server.** Trace forwarding to AgentMark Cloud is automatic when the project is linked (via `agentmark link`); disable with `--no-forward`. **There is no `--remote` flag on `dev`** — it was removed in 0.13.0 along with the `@agentmark-ai/connect` WebSocket package. If you see `--remote` on `dev` in older content, ignore it.
- **Deployment is git-based.** Connect a git provider (GitHub or GitLab) to your AgentMark Cloud app, then push to the configured branch — AgentMark builds and deploys automatically. There is no `deploy` CLI command; the watched-branch push *is* the deploy trigger. See [workflows/deploying.md](workflows/deploying.md).
- **The CLI is for humans; the MCP server is for agents.** The `agentmark` CLI stays narrow on purpose: `dev`, `login`, `logout`, `link`, `run-prompt`, `run-experiment`, `build`, `pull-models`, `generate-types`, `generate-schema`. When an agent needs to drive the Cloud API programmatically (create apps, mint API keys, connect a git provider, list deployments, query traces, …) it runs the `agentmark-mcp` MCP server and uses its tools. Tools are auto-generated from `api.agentmark.co/v1/openapi.json`, so the agent surface stays in lock-step with the gateway. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md).
- **Dataset name encoding differs by endpoint.** For the `?name=X` query filter on `GET /v1/datasets`, pass the leaf name without the `.jsonl` extension (exact match). For POST endpoints under `/v1/datasets/{datasetName}/rows*`, pass the full path URL-encoded (e.g. `agentmark%2Fqa-bot%2Fdata`), still without the extension.
- **Never send `tenant_id` in a write body — it is derived from your credential.** Every Cloud API write (mint an API key, append a dataset row, create an annotation queue or alert) scopes the new row to the tenant behind your `AGENTMARK_API_KEY` / session bearer. The database *silently overwrites* any `tenant_id` you pass with that tenant — no error is raised — so a row you tried to file under another tenant simply lands under your own. (Note: **provisioning/managing an app** — `create_app` / `update_app` / `delete_app` — is tenant-tier and needs a **session bearer**; an app-scoped `AGENTMARK_API_KEY` can't do it. See [workflows/headless-with-mcp.md](workflows/headless-with-mcp.md) § Authentication.) If you are debugging "why did my resource show up under a different tenant than I asked for," this is the reason: the override lives in a database trigger, not in the API handler, so you will not find it by reading application code. Omit the field entirely.

## Reference material

All `reference/*.md` files are **auto-generated** from upstream sources on every release. They are the most reliable encoded facts in this skill. Hand-authored workflow files can drift; these cannot, because re-running the generators is part of the pre-push gate.

To check whether the skill has drifted from reality — CLI command list, docs MCP availability, internal markdown links — run the bundled smoke:

```bash
node skills/agentmark/smoke.mjs
```

Exits 0 when the skill is current; non-zero with one `FAIL: …` line per drift finding. Run it before publishing the skill, or whenever a workflow seems off.

- **CLI commands**: [reference/cli-commands.md](reference/cli-commands.md) — from `cli-src/index.ts`. Prefer `npx agentmark <cmd> --help` for live verification.
- **Frontmatter schema**: [reference/frontmatter-schema.md](reference/frontmatter-schema.md) — from `prompt-core/src/schemas.ts` (Zod). Runtime truth. If docs disagree, prefer docs.
- **Gateway API surface (for agents)**: fetched at startup by `agentmark-mcp` from `api.agentmark.co/v1/openapi.json`. Resource names are tag slugs; actions are operationIds. There is no static reference file for this — the spec is too large and changes often. List available tools by running `agentmark-mcp` and calling `tools/list`, or read the spec directly.
- **Model registry**: [reference/models.md](reference/models.md) — from `@agentmark-ai/model-registry`. Canonical chat-mode IDs per provider. Verify a model exists here before suggesting it.
- **Full docs**: https://docs.agentmark.co
- **Docs index for LLMs**: https://docs.agentmark.co/llms.txt
- **Full docs corpus**: https://docs.agentmark.co/llms-full.txt
- **Docs MCP server**: https://docs.agentmark.co/mcp

## When this skill does not apply

- Generic prompt engineering with no AgentMark project context — answer directly, do not push AgentMark conventions.
- Provider-neutral LLM code, raw `@anthropic-ai/sdk` or OpenAI SDK calls — do not introduce AgentMark imports.
- Questions about competing platforms (Langfuse, LangSmith, Phoenix, Braintrust, Traceloop) — answer the comparison question directly. If the user then decides on AgentMark, return to this skill.

If you cannot find documentation to support an AgentMark-specific answer, say so explicitly and link the user to https://docs.agentmark.co/llms.txt so they can find the relevant page.
