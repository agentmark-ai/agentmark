# AgentMark Eval Gate

Run AgentMark evals on changed prompts and gate PRs on the results.

This action wraps [`@agentmark-ai/cli`](https://www.npmjs.com/package/@agentmark-ai/cli) and emits JUnit XML — surfaced in the PR check panel, the Checks tab, and a job summary by `mikepenz/action-junit-report`.

> **Action path:** This action lives inside the AgentMark OSS monorepo. Reference it as `agentmark-ai/agentmark/eval-action@<ref>` (note the nested path), not as a standalone repo.

## Quick start

```yaml
name: Evals
on: pull_request

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # required so the action can diff against the PR base
      - uses: agentmark-ai/agentmark/eval-action@v1
        with:
          api-key: ${{ secrets.AGENTMARK_API_KEY }}
```

That's it. On every PR, the action evaluates the `.prompt.mdx` files changed in the diff and reports the results as a PR check alongside any other test runs in the workflow.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `api-key` | optional | — | AgentMark API key. Required for cloud-backed runs; omit for fully local evals. |
| `prompts` | optional | changed `.prompt.mdx` files | Space-separated list or glob of prompt files to evaluate. |
| `threshold` | optional | — | Pass-rate threshold (0–100). Fails the workflow if overall pass rate is below this number. |
| `working-directory` | optional | `.` | Directory to run from. |
| `results-glob` | optional | `agentmark-results-*.xml` | Pattern for per-prompt JUnit XML output files. |
| `cli-version` | optional | `latest` | npm version specifier for `@agentmark-ai/cli`. Pin for reproducible CI. |

## Outputs

| Output | Description |
|---|---|
| `results-glob` | Glob matching the JUnit XML files produced. Wire into downstream steps to post-process. |

## What gets gated

Two independent gate predicates fire on every run; either failing fails the build:

1. **Per-row gate** — every `(row × scorer)` pair appears as a `<testcase>`. If the scorer's `passed` flag is `false`, the action emits `<failure>` and the check reports the failure inline.
2. **Threshold gate** (optional) — when `threshold:` is set, the workflow also fails if the overall pass rate is below the threshold, independent of per-row failures.

## Example workflows

See [`examples/`](./examples/) for:

- [`basic.yml`](./examples/basic.yml) — minimal install
- [`with-threshold.yml`](./examples/with-threshold.yml) — hard pass-rate gate
- [`explicit-prompts.yml`](./examples/explicit-prompts.yml) — evaluate a fixed list of prompt files

## Coexists with your existing tests

The action emits JUnit XML, the same format your `pytest` / `jest` / `vitest` runs already emit. Failures show up in the same PR check panel — no new dashboard to learn.

## License

[AGPL-3.0](./LICENSE)
