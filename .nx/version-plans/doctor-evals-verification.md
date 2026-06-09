---
'@agentmark-ai/cli': minor
---

feat(cli): doctor --smoke verifies evals are listable; deprecate vestigial agentmark.json `evals`

`agentmark doctor --smoke` gains a `smoke.evals` check. After the live prompt
run, it POSTs the `get-evals` control-plane job to the dev server and asserts the
handler answers with the canonical `{ type: "evals" }` envelope. This is the
verification surface for the unified-dispatch feature: it catches the exact
failure behind *"No evals available"* in the New Experiment dialog — a deployed
handler that runs prompts fine but can't list evals (e.g. a hand-rolled
prompt-run/dataset-run switch instead of `runner.dispatch`). It passes with the
registered eval count (a clean "0 evals registered" when none), fails with a fix
pointing at `runner.dispatch`, and warns (never blocks) if the probe itself errors.

Also deprecates the top-level `evals` field in `agentmark.json`. The dashboard
now lists a running app's evals live via that same get-evals job, so the static
declaration has no effect. It is marked `deprecated` in the bundled schema but
stays a *known* key, so existing configs that still carry it validate unchanged
(no new unknown-key warning). The schema's properties are now pinned against the
CLI's `KNOWN_CONFIG_KEYS` so the two can't drift in either direction.
