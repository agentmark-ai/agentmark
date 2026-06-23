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
  model_name: gpt-5-mini
test_settings:
  dataset: ./data.jsonl
---
```

For the full `test_settings` schema, fetch `https://docs.agentmark.co/evaluate/datasets.md`.

## Row shape

Each line is one JSON object with an **`input`** object holding the props your prompt expects, plus an optional **`expected_output`** (ground truth for evals). `run-experiment` reads `row.input` for the props — a flat row without an `input` wrapper is silently skipped, so a flat dataset runs **0 rows** and the experiment vacuously "passes". Always wrap props in `input`.

```jsonl
{"input": {"name": "Alice"}, "expected_output": "greeting-en"}
{"input": {"name": "Bob"}}
{"input": {"name": "你好"}, "expected_output": "greeting-zh"}
```

Run an experiment against the dataset to see one row become one trace per execution.

## Three ways to grow a dataset

### 1. Hand-author

Edit the `.jsonl` directly. Useful for the first 5–20 rows and edge cases.

### 2. Import from production traces

Use the gateway API to materialize dataset rows from real traces or spans. Two equivalent surfaces (pick whichever fits your runtime):

**REST** (scripts, CI):

```bash
# The dataset name in the URL path is URL-encoded and omits the `.jsonl` extension.
DATASET=$(printf 'qa-bot/data' | jq -sRr @uri)

curl -fsS -X POST "$AGENTMARK_API_URL/v1/datasets/$DATASET/rows/from-traces" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID" -H "Content-Type: application/json" \
  -d '{"trace_ids":["<id1>","<id2>"]}'

curl -fsS -X POST "$AGENTMARK_API_URL/v1/datasets/$DATASET/rows/from-spans" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID" -H "Content-Type: application/json" \
  -d '{"span_ids":["<id1>","<id2>"]}'
```

**MCP** (IDE agent):

```text
agent: import_dataset_rows_from_traces({ datasetName: "qa-bot/data",
                                         trace_ids: ["<id1>", "<id2>"] })
agent: import_dataset_rows_from_spans({  datasetName: "qa-bot/data",
                                         span_ids:  ["<id1>", "<id2>"] })
```

This is the canonical pattern for building a regression dataset from observed failures. The transformation rules (how trace I/O maps to dataset row shape) are documented at `https://docs.agentmark.co/evaluate/annotations.md` — see the "Save to dataset" section, which is the canonical home for the trace→row mapping (relocated from `evaluate/datasets.md`).

**Reshape each imported row before you run it as a test.** The import mirrors the trace, not your test intent — a row captured from a failing trace is not yet a usable test case:

- **`input`** comes back as the **rendered messages** the model received (a `[{role, content}]` array), not the prompt's props. Replace it with the props your prompt expects — the same `input` shape as the hand-authored rows above (e.g. `{"name": "Alice"}`) — or the prompt's `{props.*}` references resolve to nothing and the row tests garbage.
- **`expected_output`** is the trace's **actual** output. When you are capturing a failure, that output *is* the bug — replace it with the **correct** answer you want to assert, or the eval "passes" against the wrong result.

Reshaping is the step that turns a captured failure into a real regression test; skip it and you get confusing failures or a false pass.

### 3. Append programmatically

```bash
curl -fsS -X POST "$AGENTMARK_API_URL/v1/datasets/$DATASET/rows" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID" -H "Content-Type: application/json" \
  -d '{"row":{"name":"Carol"}}'

# MCP: append_dataset_row({ datasetName: "qa-bot/data", row: { name: "Carol" } })
```

Useful when collecting rows from a feedback loop (e.g., user flagged a response as bad → append the inputs to the regression set).

## Listing existing datasets

```bash
curl -fsS "$AGENTMARK_API_URL/v1/datasets" \
  -H "Authorization: Bearer $AGENTMARK_API_KEY" \
  -H "X-Agentmark-App-Id: $AGENTMARK_APP_ID"

# MCP: list_datasets()
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
agentmark run-experiment agentmark/qa-bot.prompt.mdx --sample 20 --seed 42

# Run on a specific row range
agentmark run-experiment agentmark/qa-bot.prompt.mdx --rows 0,3-5,9

# Train/test split
agentmark run-experiment agentmark/qa-bot.prompt.mdx --split test:80 --seed 42
```

See [running-experiments.md](running-experiments.md) for the full sampling semantics.

## Common mistakes

- **Including the `.jsonl` extension in `datasetName`** — pass the path or leaf name without the extension. The API path regex does not tolerate `.jsonl`.
- **One JSON array instead of one-object-per-line** — `.jsonl` requires newline-delimited JSON. A single `[{...}, {...}]` array will not parse.
- **Schema mismatch** — every row must satisfy the prompt's `input_schema`. The experiment will fail on the first non-conforming row. Validate before running.
- **Building one massive dataset for everything** — prefer multiple focused datasets (one per scenario) so you can run fast targeted experiments. Sampling helps but does not substitute for cohesion.
