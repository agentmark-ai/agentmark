# Using evals

Evals are functions that score each row's output during an experiment. They turn "the prompt produced something" into "the prompt produced something that meets the bar." Evals are the gate that makes `--threshold` meaningful.

## Two kinds of evals

| Type | What it is | When to use |
|---|---|---|
| Code-based | A function (TS or Python) that takes input + output and returns a score | Deterministic checks: exact match, regex, length, schema conformance |
| LLM-as-judge | A prompt that scores another prompt's output | Subjective quality: helpfulness, tone, factual accuracy against a reference |

Both kinds attach to a prompt via `test_settings.evals` in the prompt frontmatter (a list of declared eval names). For the current frontmatter shape, fetch `https://docs.agentmark.co/evaluate/writing-evals.md`.

## Score config — declare in `agentmark.json`

Scores are declared under a `scores` map in `agentmark.json`. Each entry sets a value type (`numeric`, `categorical`, or `boolean`) plus an optional `description`. Minimum viable shape:

```json
{
  "scores": {
    "accuracy": { "type": "numeric", "min": 0, "max": 1 }
  }
}
```

**For the full field reference** (`min`/`max` on numeric, `categories` array on categorical, the absence of `direction`, all gotchas) fetch `https://docs.agentmark.co/evaluate/writing-evals.md`. The authoritative runtime schema comes from `agentmark generate-schema` (writes `.agentmark/prompt.schema.json`).

Two facts worth carrying outside the docs because they catch agents out:

- Score configs live in `agentmark.json` and sync on deploy. To change one, edit the file and redeploy. There is **no** `/v1/score-configs` endpoint — the gateway exposes recorded score *values* under `/v1/scores*`, not the config itself.
- The schema has no `direction` field. Value semantics are domain-driven; do not invent one.

## Wiring an eval to a prompt

Add the eval names to `test_settings.evals` in the prompt's frontmatter:

```yaml
---
name: qa-bot
text_config:
  model_name: gpt-5-mini
test_settings:
  dataset: ./data.jsonl
  evals: [accuracy, is_safe]
---
```

For the canonical pattern (including how code-based vs LLM-as-judge evals are registered), fetch `https://docs.agentmark.co/evaluate/writing-evals.md`.

After wiring, run an experiment:

```bash
agentmark run-experiment agentmark/qa-bot.prompt.mdx
```

Each row's output is scored by every linked eval. Scores appear in the result table and are persisted to the trace store.

## Gating CI on eval results

Combine `--threshold` with `--format junit` to fail PRs that regress quality:

```bash
agentmark run-experiment agentmark/qa-bot.prompt.mdx --threshold 80 --format junit > results.xml
```

The CLI exits non-zero when pass rate is below the threshold. Upload `results.xml` as a CI artifact for surfacing in GitHub Actions / GitLab / Jenkins.

### Landing CI eval traces in the PR's preview env

The `eval-action` (GitHub) and `eval-component` (GitLab) attribute a run's traces to the pull request's preview environment so a failing eval links straight to its trace. On a `pull_request` event they set `AGENTMARK_PR_NUMBER` automatically; the SDK tracer reads it. Two requirements catch people out:

- Use **one** key scoped to the **Preview** environment kind (Dashboard create-key dialog → Environment scope → Environment kinds → Preview), not a per-env pinned key. It authorizes every PR's preview env as it's created, so CI never provisions a key per PR.
- Leave the action's `environment` input empty for the PR-preview case. Set `environment` only for non-PR runs (e.g. a nightly against staging), which sets `AGENTMARK_ENVIRONMENT` instead.

Neither `eval-action` nor `eval-component` is published yet, so use the raw CLI and export `AGENTMARK_PR_NUMBER` / `AGENTMARK_ENVIRONMENT` yourself for the same behavior. For the full workflow, fetch `https://docs.agentmark.co/deploy/ci-cd.md`.

## LLM-as-judge: keep the judge prompt versioned

When the eval is itself a prompt (LLM judging LLM), put the judge prompt in the same repo and commit it. This makes judge changes reviewable. Avoid inline judge prompts in frontmatter — they drift silently.

## Score aggregation

The gateway exposes score data under the `scoring` resource. REST endpoints and MCP tool equivalents:

```bash
# Distinct score names that have been recorded
curl -fsS "$AGENTMARK_API_URL/v1/scores/names" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
# MCP: get_score_names()

# Mean / distribution per name
curl -fsS "$AGENTMARK_API_URL/v1/scores/aggregations" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
# MCP: get_score_aggregations()

# Raw scores
curl -fsS "$AGENTMARK_API_URL/v1/scores?limit=50" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
# MCP: list_scores({ limit: 50 })
```

Use this for tracking score drift over time, not for gating individual experiments (which is what `--threshold` is for).

## Importing human review as scores

Annotation queues let humans review traces and submit scores. The submitted scores feed the same aggregation surface as automated evals. For the workflow, fetch `https://docs.agentmark.co/evaluate/annotations.md`.

## Common mistakes

- **Declaring a score in `agentmark.json` but never wiring it to a prompt** — the score config exists but no run produces it. Verify with `GET /v1/scores/names` (or MCP `get_score_names()`) after running an experiment.
- **Adding a `direction` field to score config** — no such field exists in the schema. The score config only carries `type`, `description`, `min`/`max`, and `categories`. Direction is interpreted at read time, not declared.
- **Adding evals after the dataset is huge** — re-running the experiment to backfill scores costs N × per-row eval cost. Add evals early.
- **Treating LLM-as-judge as deterministic** — judge scores vary across runs. Use multiple seeds or aggregate over many runs before trusting a pass/fail.
- **Skipping evals with `--skip-eval` and then reading the table as "passing"** — the table shows outputs without scores; nothing was gated.
