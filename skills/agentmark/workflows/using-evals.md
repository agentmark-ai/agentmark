# Using evals

Evals are functions that score each row's output during an experiment. They turn "the prompt produced something" into "the prompt produced something that meets the bar." Evals are the gate that makes `--threshold` meaningful.

## Two kinds of evals

| Type | What it is | When to use |
|---|---|---|
| Code-based | A function (TS or Python) that takes input + output and returns a score | Deterministic checks: exact match, regex, length, schema conformance |
| LLM-as-judge | A prompt that scores another prompt's output | Subjective quality: helpfulness, tone, factual accuracy against a reference |

Both kinds attach to a prompt via `test_settings.evals` in the prompt frontmatter (a list of declared eval names). For the current frontmatter shape, fetch `https://docs.agentmark.co/evaluate/writing-evals.md`.

## Score config — declare in `agentmark.json`

Scores are declared in `agentmark.json` under a `scores` map. Each entry sets the score's value type (`numeric`, `categorical`, or `boolean`), plus an optional human-readable `description`. Numeric scores take `min`/`max`; categorical scores take a `categories` array of `{label, value}` pairs:

```json
{
  "scores": {
    "accuracy": {
      "type": "numeric",
      "description": "How well the output matches the reference answer (1 = perfect)",
      "min": 0,
      "max": 1
    },
    "is_safe": {
      "type": "boolean",
      "description": "Whether the output is safe to display to a user"
    },
    "tone": {
      "type": "categorical",
      "categories": [
        { "label": "friendly", "value": 1 },
        { "label": "neutral",  "value": 0 },
        { "label": "hostile",  "value": -1 }
      ]
    }
  }
}
```

The score config schema has no `direction` field — value semantics are domain-driven and not captured in the config. For the authoritative schema, run `npx agentmark generate-schema` and inspect `.agentmark/agentmark.schema.json`. Score configs are read-only via the gateway (e.g. `npx agentmark api score-configs list-score-configs`); to change one, edit `agentmark.json` and redeploy.

## Wiring an eval to a prompt

Add the eval names to `test_settings.evals` in the prompt's frontmatter:

```yaml
---
name: qa-bot
text_config:
  model_name: gpt-4o-mini
test_settings:
  dataset: ./data.jsonl
  evals: [accuracy, is_safe]
---
```

For the canonical pattern (including how code-based vs LLM-as-judge evals are registered), fetch `https://docs.agentmark.co/evaluate/writing-evals.md`.

After wiring, run an experiment:

```bash
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx
```

Each row's output is scored by every linked eval. Scores appear in the result table and are persisted to the trace store.

## Gating CI on eval results

Combine `--threshold` with `--format junit` to fail PRs that regress quality:

```bash
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --threshold 80 --format junit > results.xml
```

The CLI exits non-zero when pass rate is below the threshold. Upload `results.xml` as a CI artifact for surfacing in GitHub Actions / GitLab / Jenkins.

## LLM-as-judge: keep the judge prompt versioned

When the eval is itself a prompt (LLM judging LLM), put the judge prompt in the same repo and commit it. This makes judge changes reviewable. Avoid inline judge prompts in frontmatter — they drift silently.

## Score aggregation

The gateway exposes score data under the `scoring` resource (OpenAPI tag → specli resource name). Always run `--help` for canonical action names; the auto-generated specli subcommands look like:

```bash
# Show available actions under the scoring resource
npx agentmark api scoring --help

# Typical actions (action names mirror OpenAPI operationIds):
npx agentmark api scoring get-score-names          # distinct score names
npx agentmark api scoring get-score-aggregations   # mean / distribution per name
npx agentmark api scoring list-scores --remote --limit 50   # raw scores
```

Use this for tracking score drift over time, not for gating individual experiments (which is what `--threshold` is for).

## Importing human review as scores

Annotation queues let humans review traces and submit scores. The submitted scores feed the same aggregation surface as automated evals. For the workflow, fetch `https://docs.agentmark.co/evaluate/annotations.md`.

## Common mistakes

- **Declaring a score in `agentmark.json` but never wiring it to a prompt** — the score config exists but no run produces it. Verify with `npx agentmark api scoring get-score-names` after running an experiment.
- **Adding a `direction` field to score config** — no such field exists in the schema. The score config only carries `type`, `description`, `min`/`max`, and `categories`. Direction is interpreted at read time, not declared.
- **Adding evals after the dataset is huge** — re-running the experiment to backfill scores costs N × per-row eval cost. Add evals early.
- **Treating LLM-as-judge as deterministic** — judge scores vary across runs. Use multiple seeds or aggregate over many runs before trusting a pass/fail.
- **Skipping evals with `--skip-eval` and then reading the table as "passing"** — the table shows outputs without scores; nothing was gated.
