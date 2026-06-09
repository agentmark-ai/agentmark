---
'@agentmark-ai/cli': minor
---

feat(cli): add `agentmark doctor`, a static setup health check

`agentmark doctor` inspects an AgentMark project without a network call or
spawning a server, and reports each finding with an actionable fix:
agentmark.json validity, the `agentmarkPath: "/"` footgun, and field/schema
shape (required keys present, no unknown top-level keys); the three setup files
(`agentmark.client.ts`/`agentmark_client.py`, the dev-server entry, and the
managed-deploy handler); env/credential hygiene (`.env` gitignored,
`AGENTMARK_API_KEY` / `AGENTMARK_APP_ID` set); prompt frontmatter + `model_name`;
prompt models declared in `builtInModels` (which prompt-core enforces as an
allowlist when non-empty); builtInModels recognized by the model catalog; and AI
SDK adapter/provider major-version coherence. `--json` for machine output,
`--strict` to fail on warnings in CI.

The setup-file checks map to the real run paths: the client is required for
everything (fail when missing), the dev-server entry backs local
run-prompt/run-experiment (warn), and `handler.ts`/`handler.py` is the entry
AgentMark Cloud bundles for managed deployment: warn when absent, fail when an
explicit `handler` key in agentmark.json points at a file that does not exist.

It reuses the same helpers the other commands do (project-layout, setup-file
resolution, and model classification), so its findings match what `dev`,
`build`, and `generate-schema` act on. As part of that refactor, the "no
agentmark.json here" error is now unified across `build`, `generate-schema`, and
`pull-models` (the latter two previously pointed at a non-existent `agentmark
init`).

`--smoke` adds an opt-in live tier (assumes `agentmark dev` is running): it runs
one representative prompt through the dev-server webhook (the same path
`run-prompt` uses), confirms real content + token usage came back, then fetches
the emitted trace from the local API server and checks its shape (token usage,
input, output, and a model on a span). That verifies the SDK, adapter/executor,
provider credentials, and tracing-in-the-right-format end to end, indirectly,
with no provider-specific knowledge. `--prompt <path>` picks the prompt to run;
`--boot` starts `agentmark dev` headless and tears it down after, so the live
check is a single command (for CI / agents) instead of a two-terminal dance.

`--json` emits `{ ok, counts, results: [{ id, group, title, status, detail, fix }] }`
with stable check ids and a `pass | warn | fail | skip` status, so agents can
branch on the result and apply each `fix` programmatically.
