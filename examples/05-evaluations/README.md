# 05 — Evaluations

Test prompts against datasets and measure quality with evals.

## The prompt

`classify-sentiment.prompt.mdx` classifies text sentiment and returns a structured result. It's paired with a dataset (`sentiment-data.jsonl`) containing test inputs and expected outputs.

## Files

- `classify-sentiment.prompt.mdx` — The prompt with eval configuration
- `sentiment-data.jsonl` — Test dataset with inputs and expected outputs

## Run it

```bash
# Run the experiment (executes prompt against every dataset item + evals)
agentmark run-experiment agentmark/classify-sentiment.prompt.mdx

# Output as JSON
agentmark run-experiment agentmark/classify-sentiment.prompt.mdx --format json

# Fail if less than 80% of items pass
agentmark run-experiment agentmark/classify-sentiment.prompt.mdx --threshold 80

# Skip evals, just run the prompt against the dataset
agentmark run-experiment agentmark/classify-sentiment.prompt.mdx --skip-eval
```

## Dataset format

Each line in the JSONL file is an object with `input` and `expected_output`:

```json
{"input": {"text": "I love this product!"}, "expected_output": "{\"sentiment\": \"positive\"}"}
```

- `input` — The props passed to the prompt (matches `input_schema`)
- `expected_output` — A JSON string of the expected result (compared by `exact_match_json`)

## What to notice

- `test_settings.dataset` points to a JSONL file with test data
- `test_settings.evals` lists the evaluation functions to run (registered in `agentmark.client.ts`)
- The schema only returns `sentiment` (not `confidence`) so `exact_match_json` can compare deterministically
- `run-experiment` shows a table with pass/fail per item and overall pass rate
- Use `--threshold` in CI/CD to gate deployments on quality
