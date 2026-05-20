# Building datasets

Datasets are `.jsonl` files — one JSON object per line, each representing one test row. A row's shape matches the prompt's `input_schema` (props) plus optional expected outputs for evals.

## File location

By convention, place dataset files next to the prompt they exercise:

```
agentmark/qa-bot/
├── qa-bot.prompt.mdx
└── data.jsonl
```

Reference the dataset from the prompt's frontmatter under `test_settings.dataset`:

```yaml
---
name: qa-bot
text_config:
  model_name: gpt-4o-mini
test_settings:
  dataset: ./data.jsonl
---
```

For the full `test_settings` schema, fetch `https://docs.agentmark.co/evaluate/datasets.md`.

## Row shape

Each line is one JSON object with at least the props the prompt expects. Expected outputs and metadata are added per-row when evals need them.

```jsonl
{"name": "Alice"}
{"name": "Bob"}
{"name": "你好"}
```

Run an experiment against the dataset to see one row become one trace per execution.

## Three ways to grow a dataset

### 1. Hand-author

Edit the `.jsonl` directly. Useful for the first 5–20 rows and edge cases.

### 2. Import from production traces

Use the gateway API to materialize dataset rows from real traces or spans. The dataset name is a positional argument (URL-encoded path without `.jsonl`):

```bash
# Subcommand and flag shapes are auto-generated from the OpenAPI spec.
# Always run --help to see the canonical form:
npx agentmark api datasets --help

# Once you know the shape, e.g.:
npx agentmark api datasets import-dataset-rows-from-traces qa-bot/data --trace-ids <id1>,<id2>
npx agentmark api datasets import-dataset-rows-from-spans  qa-bot/data --span-ids  <id1>,<id2>
```

This is the canonical pattern for building a regression dataset from observed failures. The transformation rules (how trace I/O maps to dataset row shape) are documented at `https://docs.agentmark.co/evaluate/datasets.md`.

### 3. Append programmatically

```bash
# See `npx agentmark api datasets --help` for the canonical flag set.
npx agentmark api datasets append-dataset-row qa-bot/data --row '{"name":"Carol"}'
```

Useful when collecting rows from a feedback loop (e.g., user flagged a response as bad → append the inputs to the regression set).

## Listing existing datasets

```bash
npx agentmark api datasets list-datasets
```

Returns each dataset's `row_count` and `created_at`. Use this before importing rows to confirm the dataset name.

## Dataset naming — two distinct encodings

The encoding depends on which endpoint you hit:

**Path parameter** (POST endpoints like `/v1/datasets/{datasetName}/rows*`) — full path without `.jsonl`, URL-encoded:

| File on disk | Path parameter |
|---|---|
| `agentmark/qa-bot/data.jsonl` | `agentmark%2Fqa-bot%2Fdata` |
| `agentmark/scenarios/edge-cases.jsonl` | `agentmark%2Fscenarios%2Fedge-cases` |
| `agentmark/has space.jsonl` | `agentmark%2Fhas%20space` |

**Query filter** (`GET /v1/datasets?name=X`) — leaf name only, exact match:

| File on disk | `?name=X` |
|---|---|
| `agentmark/qa-bot/data.jsonl` | `data` |
| `agentmark/scenarios/edge-cases.jsonl` | `edge-cases` |

If two datasets share a leaf name, use the full-path GET (no `?name=` filter, then filter client-side) or use the path-parameter form directly.

## Sampling and splitting at run time

You usually do not need separate train/test files. `agentmark run-experiment` can sample or split a single dataset deterministically:

```bash
# Run on 20% of rows (reproducible with --seed)
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --sample 20 --seed 42

# Run on a specific row range
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --rows 0,3-5,9

# Train/test split
npx agentmark run-experiment agentmark/qa-bot.prompt.mdx --split test:80 --seed 42
```

See [running-experiments.md](running-experiments.md) for the full sampling semantics.

## Common mistakes

- **Including the `.jsonl` extension in `datasetName`** — pass the path or leaf name without the extension. The API path regex does not tolerate `.jsonl`.
- **One JSON array instead of one-object-per-line** — `.jsonl` requires newline-delimited JSON. A single `[{...}, {...}]` array will not parse.
- **Schema mismatch** — every row must satisfy the prompt's `input_schema`. The experiment will fail on the first non-conforming row. Validate before running.
- **Building one massive dataset for everything** — prefer multiple focused datasets (one per scenario) so you can run fast targeted experiments. Sampling helps but does not substitute for cohesion.
