# Running experiments

An experiment runs a prompt against every row in its linked dataset and (by default) executes evals on each result. Each row produces one trace. The experiment as a whole is grouped under a `DatasetRunId`.

`run-experiment` is **not** `run-prompt`. `run-prompt` is for a single input; `run-experiment` is the batch + eval flow.

## Prerequisites

- `agentmark dev` running locally (in another shell), OR pass `--server <url>` to target a non-default webhook server. **`agentmark dev` needs a runnable project**: a `package.json` with the adapter deps, an `agentmark.client.ts` (model registry + loader + `evals`), and a `dev-entry.ts` webhook entry point. A prompts-only repo (just `agentmark.json` + `.prompt.mdx` files) has none of these — run `npx create-agentmark` to scaffold them (it writes `dev-entry.ts` + `agentmark.client.ts`), or the dev server exits with "No dev server entry point found."
- A `.prompt.mdx` file with a dataset reference in its frontmatter.
- The dataset file exists, with each row **wrapped as `{"input": {…props…}, "expected_output": …}`** (see [building-datasets.md](building-datasets.md)). Flat rows (props at the top level) are silently skipped — the experiment runs 0 rows and exits 0.

## Basic invocation

```bash
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx
```

Default output is a table summarizing each row's input, output, and any eval scores.

## Output formats

For CI integration or post-processing, change the format:

```bash
# Newline-delimited JSON, one row per line
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --format jsonl

# Single JSON document (good for piping to jq)
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --format json

# CSV for spreadsheets
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --format csv

# JUnit XML — pipe to a file for CI gating
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --format junit > results.xml
```

## CI gating with thresholds

Fail the build if the experiment's pass rate drops below a percentage:

```bash
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --threshold 80
```

The CLI exits non-zero if the threshold is not met. Pair with `--format junit` for richer CI surfacing (GitHub Actions, GitLab, Jenkins all consume JUnit XML).

## Sampling and splitting

For fast iteration on a large dataset, sample or pick specific rows:

```bash
# Random 20% sample, reproducible
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --sample 20 --seed 42

# Specific rows by index or range
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --rows 0,3-5,9

# Train/test split
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --split train:80 --seed 42
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --split test:80 --seed 42
```

Notes:
- `--sample N` selects N% of rows uniformly at random.
- `--rows` accepts comma-separated indices and ranges (zero-indexed).
- `--split train:80` takes the first 80% by seed-deterministic ordering; `--split test:80` takes the remaining 20%. Use the same `--seed` to keep train/test stable across runs.
- All sampling/splitting is **deterministic given the seed** — runs are reproducible.

## Skipping evals during iteration

When you only want to see model output (e.g., tuning a prompt template), skip evals:

```bash
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --skip-eval
```

This is faster and cheaper. Re-enable evals (drop `--skip-eval`) when you're ready to gate quality.

## Tuning concurrency

By default, `run-experiment` runs **20 dataset rows in parallel** through a bounded worker pool. The slowest row bounds wall-clock time, not the sum of all rows. Tune with `--concurrency`:

```bash
# Higher concurrency for fast models / generous rate limits
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --concurrency 50

# Drop to serial when you're hitting provider rate limits
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --concurrency 1
```

Also overridable per-deployment via the `AGENTMARK_EXPERIMENT_CONCURRENCY` env var (clamped to `[1, 20]` unless you set the flag). A single row failure no longer aborts the whole run — the failed row emits an error chunk and the run continues with the remaining rows.

## Regression gating against a prior run

`--baseline-commit <ref>` compares this run against a prior run at the named commit (any git ref or tree hash). When combined with a `test_settings.regression_tolerance` block in the prompt frontmatter, the CLI exits non-zero if scores regress beyond the tolerance:

```bash
# Compare to the run that produced the merge-base of the current PR
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx \
  --baseline-commit "$(git merge-base origin/main HEAD)"
```

Useful in PR CI: each push runs the experiment, compares to the baseline, and fails the build if the prompt change causes a regression. For the `regression_tolerance` schema, fetch `https://docs.agentmark.co/evaluate/running-experiments.md`.

## Reading experiment results from the API

After running an experiment, you can list and inspect results via the gateway. REST works for scripts; MCP works for IDE agents:

```bash
# REST — list recent experiments
curl -fsS "$AGENTMARK_API_URL/v1/experiments?limit=10" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"

# REST — get details for one experiment (per-trace inputs, outputs, costs, scores)
curl -fsS "$AGENTMARK_API_URL/v1/experiments/<experimentId>" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"

# REST — list individual traces in an experiment
curl -fsS "$AGENTMARK_API_URL/v1/traces?dataset_run_id=<runId>" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"
```

MCP equivalents: `list_experiments({ limit })`, `get_experiment({ experimentId })`, `list_traces({ datasetRunId })`.

After `agentmark login` the same calls work against your linked Cloud app using the cached session bearer — no API key required for interactive use.

## Common mistakes

- **Running `run-experiment` without `agentmark dev` up** — the command will fail to reach the webhook server. Either start `dev` first or pass `--server` to a running instance.
- **Flat dataset rows (no `input` wrapper)** — `run-experiment` reads `row.input` for props, so flat rows are silently skipped: the run prints "Evaluations enabled," produces 0 rows, and exits 0 (reads as a pass). Wrap every row as `{"input": {…}, "expected_output": …}` (see [building-datasets.md](building-datasets.md)).
- **Confusing `--rows` with row count** — `--rows 5` means "row at index 5", not "first 5 rows". For first 5 use `--rows 0-4`.
- **Different seeds across `--split train:80` and `--split test:80`** — the splits will overlap. Use the same `--seed` for both.
- **Setting `--truncate 0` and getting unwieldy table output** — `--truncate 0` disables truncation entirely; use a finite value (default `1000`) for table format, or use `--format jsonl` for full output.
