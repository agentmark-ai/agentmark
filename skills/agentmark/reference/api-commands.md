<!--
  Auto-generated from oss/agentmark/packages/cli/cli-src/server/openapi-spec.json.
  Do not hand-edit. Run `yarn generate-skill-api-reference` to regenerate.
-->

# AgentMark gateway API — `npx agentmark api` reference

> Auto-generated from the OpenAPI spec. `npx agentmark api` is a specli wrapper — resource names are tag slugs (kebab-case), action names mirror `operationId` directly. **Always prefer `npx agentmark api <resource> --help`** for the live shape (cached for 24h; pass `--refresh` to invalidate).

Add `--remote` to any command to target AgentMark Cloud instead of the local dev server (requires `agentmark login` + `agentmark link`).

## Resources

- [`api-keys`](#api-keys) — 3 action(s)
- [`apps`](#apps) — 11 action(s)
- [`capabilities`](#capabilities) — 1 action(s)
- [`config`](#config) — 1 action(s)
- [`datasets`](#datasets) — 4 action(s)
- [`deployments`](#deployments) — 2 action(s)
- [`experiments`](#experiments) — 2 action(s)
- [`metrics`](#metrics) — 1 action(s)
- [`pricing`](#pricing) — 1 action(s)
- [`prompts`](#prompts) — 1 action(s)
- [`requests`](#requests) — 1 action(s)
- [`runs`](#runs) — 1 action(s)
- [`score-configs`](#score-configs) — 2 action(s)
- [`scoring`](#scoring) — 7 action(s)
- [`sessions`](#sessions) — 2 action(s)
- [`spans`](#spans) — 3 action(s)
- [`templates`](#templates) — 1 action(s)
- [`traces`](#traces) — 4 action(s)

---

## `api-keys`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api api-keys create-api-key` | POST | `/v1/api-keys` | Create API key |
| `npx agentmark api api-keys list-api-keys` | GET | `/v1/api-keys` | List API keys |
| `npx agentmark api api-keys revoke-api-key` | DELETE | `/v1/api-keys/{apiKeyId}` | Revoke API key |

### `api-keys create-api-key`

Create API key

```bash
npx agentmark api api-keys create-api-key [--remote] [--refresh]
```

### `api-keys list-api-keys`

List API keys

```bash
npx agentmark api api-keys list-api-keys [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |

### `api-keys revoke-api-key`

Revoke API key

```bash
npx agentmark api api-keys revoke-api-key <apiKeyId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `apiKeyId` | path | ✓ |  |

---

## `apps`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api apps create-app` | POST | `/v1/apps` | Create app |
| `npx agentmark api apps delete-app` | DELETE | `/v1/apps/{appId}` | Delete app |
| `npx agentmark api apps get-app` | GET | `/v1/apps/{appId}` | Get app |
| `npx agentmark api apps get-app-git-connection` | GET | `/v1/apps/{appId}/git` | Get git connection status for an app |
| `npx agentmark api apps link-app-repository` | POST | `/v1/apps/{appId}/git/link` | Link a repository and branch to an app |
| `npx agentmark api apps list-app-git-branches` | GET | `/v1/apps/{appId}/git/branches` | List branches in a repository |
| `npx agentmark api apps list-app-git-repositories` | GET | `/v1/apps/{appId}/git/repositories` | List repositories accessible to the app's git installation |
| `npx agentmark api apps list-apps` | GET | `/v1/apps` | List apps |
| `npx agentmark api apps start-app-git-connect` | POST | `/v1/apps/{appId}/git/connect` | Mint an OAuth authorization URL for git-provider connect |
| `npx agentmark api apps unlink-app-repository` | DELETE | `/v1/apps/{appId}/git/link` | Clear the linked repository and branch |
| `npx agentmark api apps update-app` | PATCH | `/v1/apps/{appId}` | Update app |

### `apps create-app`

Create app

```bash
npx agentmark api apps create-app [--remote] [--refresh]
```

### `apps delete-app`

Delete app

```bash
npx agentmark api apps delete-app <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps get-app`

Get app

```bash
npx agentmark api apps get-app <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps get-app-git-connection`

Get git connection status for an app

```bash
npx agentmark api apps get-app-git-connection <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps link-app-repository`

Link a repository and branch to an app

```bash
npx agentmark api apps link-app-repository <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps list-app-git-branches`

List branches in a repository

```bash
npx agentmark api apps list-app-git-branches <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |
| `repository` | query | ✓ | Repository identifier in `owner/repo` form, from the `full_name` field of the repositories list. |

### `apps list-app-git-repositories`

List repositories accessible to the app's git installation

```bash
npx agentmark api apps list-app-git-repositories <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps list-apps`

List apps

```bash
npx agentmark api apps list-apps [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `name` | query |  |  |

### `apps start-app-git-connect`

Mint an OAuth authorization URL for git-provider connect

```bash
npx agentmark api apps start-app-git-connect <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps unlink-app-repository`

Clear the linked repository and branch

```bash
npx agentmark api apps unlink-app-repository <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

### `apps update-app`

Update app

```bash
npx agentmark api apps update-app <appId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `appId` | path | ✓ |  |

---

## `capabilities`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api capabilities get-capabilities` | GET | `/v1/capabilities` | Get capabilities |

### `capabilities get-capabilities`

Get capabilities

```bash
npx agentmark api capabilities get-capabilities [--remote] [--refresh]
```

---

## `config`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api config get-config` | GET | `/v1/config` | Get config |

### `config get-config`

Get config

```bash
npx agentmark api config get-config [--remote] [--refresh]
```

---

## `datasets`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api datasets append-dataset-row` | POST | `/v1/datasets/{datasetName}/rows` | Append dataset row |
| `npx agentmark api datasets import-dataset-rows-from-spans` | POST | `/v1/datasets/{datasetName}/rows/from-spans` | Import dataset rows from spans |
| `npx agentmark api datasets import-dataset-rows-from-traces` | POST | `/v1/datasets/{datasetName}/rows/from-traces` | Import dataset rows from traces |
| `npx agentmark api datasets list-datasets` | GET | `/v1/datasets` | List datasets |

### `datasets append-dataset-row`

Append dataset row

```bash
npx agentmark api datasets append-dataset-row <datasetName> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `datasetName` | path | ✓ | Dataset path without .jsonl extension (URL-encoded) |

### `datasets import-dataset-rows-from-spans`

Import dataset rows from spans

```bash
npx agentmark api datasets import-dataset-rows-from-spans <datasetName> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `datasetName` | path | ✓ | Dataset path without .jsonl extension (URL-encoded) |

### `datasets import-dataset-rows-from-traces`

Import dataset rows from traces

```bash
npx agentmark api datasets import-dataset-rows-from-traces <datasetName> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `datasetName` | path | ✓ | Dataset path without .jsonl extension (URL-encoded) |

### `datasets list-datasets`

List datasets

```bash
npx agentmark api datasets list-datasets [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `name` | query |  |  |

---

## `deployments`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api deployments get-deployment` | GET | `/v1/deployments/{deploymentId}` | Get deployment |
| `npx agentmark api deployments list-deployments` | GET | `/v1/deployments` | List deployments |

### `deployments get-deployment`

Get deployment

```bash
npx agentmark api deployments get-deployment <deploymentId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `deploymentId` | path | ✓ |  |

### `deployments list-deployments`

List deployments

```bash
npx agentmark api deployments list-deployments [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `status` | query |  |  |

---

## `experiments`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api experiments get-experiment` | GET | `/v1/experiments/{experimentId}` | Get experiment |
| `npx agentmark api experiments list-experiments` | GET | `/v1/experiments` | List experiments |

### `experiments get-experiment`

Get experiment

```bash
npx agentmark api experiments get-experiment <experimentId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `experimentId` | path | ✓ | Experiment ID (DatasetRunId). |

### `experiments list-experiments`

List experiments

```bash
npx agentmark api experiments list-experiments [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `prompt_name` | query |  |  |
| `dataset_path` | query |  |  |

---

## `metrics`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api metrics get-metrics` | GET | `/v1/metrics` | Get metrics |

### `metrics get-metrics`

Get metrics

```bash
npx agentmark api metrics get-metrics [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `start_date` | query | ✓ |  |
| `end_date` | query | ✓ |  |
| `extended` | query |  |  |

---

## `pricing`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api pricing get-pricing` | GET | `/v1/pricing` | Get LLM pricing |

### `pricing get-pricing`

Get LLM pricing

```bash
npx agentmark api pricing get-pricing [--remote] [--refresh]
```

---

## `prompts`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api prompts list-prompts` | GET | `/v1/prompts` | List or look up prompts |

### `prompts list-prompts`

List or look up prompts

```bash
npx agentmark api prompts list-prompts [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `name` | query |  | Frontmatter `name` to filter by. Returns paths of all prompts whose name matches; empty array on miss. |

---

## `requests`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api requests list-requests` | GET | `/v1/requests` | List requests |

### `requests list-requests`

List requests

```bash
npx agentmark api requests list-requests [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `status` | query |  |  |
| `user_id` | query |  |  |
| `model` | query |  |  |
| `sort_by` | query |  |  |
| `sort_order` | query |  |  |
| `filter` | query |  |  |

---

## `runs`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api runs list-run-traces` | GET | `/v1/runs/{runId}/traces` | List traces for a run |

### `runs list-run-traces`

List traces for a run

```bash
npx agentmark api runs list-run-traces <runId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `runId` | path | ✓ | Dataset run ID |
| `limit` | query |  |  |
| `offset` | query |  |  |

---

## `score-configs`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api score-configs get-score-config` | GET | `/v1/score-configs/{name}` | Get score config |
| `npx agentmark api score-configs list-score-configs` | GET | `/v1/score-configs` | List score configs |

### `score-configs get-score-config`

Get score config

```bash
npx agentmark api score-configs get-score-config <name> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `name` | path | ✓ |  |

### `score-configs list-score-configs`

List score configs

```bash
npx agentmark api score-configs list-score-configs [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |

---

## `scoring`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api scoring create-score` | POST | `/v1/scores` | Create score |
| `npx agentmark api scoring create-scores-batch` | POST | `/v1/scores/batch` | Create scores (batch) |
| `npx agentmark api scoring delete-score` | DELETE | `/v1/scores/{scoreId}` | Delete score |
| `npx agentmark api scoring get-score` | GET | `/v1/scores/{scoreId}` | Get score |
| `npx agentmark api scoring get-score-aggregations` | GET | `/v1/scores/aggregations` | Get score aggregations |
| `npx agentmark api scoring get-score-names` | GET | `/v1/scores/names` | Get score names |
| `npx agentmark api scoring list-scores` | GET | `/v1/scores` | List scores |

### `scoring create-score`

Create score

```bash
npx agentmark api scoring create-score [--remote] [--refresh]
```

### `scoring create-scores-batch`

Create scores (batch)

```bash
npx agentmark api scoring create-scores-batch [--remote] [--refresh]
```

### `scoring delete-score`

Delete score

```bash
npx agentmark api scoring delete-score <scoreId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `scoreId` | path | ✓ |  |

### `scoring get-score`

Get score

```bash
npx agentmark api scoring get-score <scoreId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `scoreId` | path | ✓ |  |

### `scoring get-score-aggregations`

Get score aggregations

```bash
npx agentmark api scoring get-score-aggregations [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `start_date` | query |  |  |
| `end_date` | query |  |  |

### `scoring get-score-names`

Get score names

```bash
npx agentmark api scoring get-score-names [--remote] [--refresh]
```

### `scoring list-scores`

List scores

```bash
npx agentmark api scoring list-scores [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `resource_id` | query |  |  |
| `resource_type` | query |  |  |
| `name` | query |  |  |
| `source` | query |  |  |
| `session_id` | query |  |  |

---

## `sessions`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api sessions list-session-traces` | GET | `/v1/sessions/{sessionId}/traces` | List traces for a session (deprecated) |
| `npx agentmark api sessions list-sessions` | GET | `/v1/sessions` | List sessions |

### `sessions list-session-traces`

List traces for a session (deprecated)

```bash
npx agentmark api sessions list-session-traces <sessionId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `sessionId` | path | ✓ |  |
| `limit` | query |  |  |
| `offset` | query |  |  |

### `sessions list-sessions`

List sessions

```bash
npx agentmark api sessions list-sessions [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `sort_by` | query |  |  |
| `sort_order` | query |  |  |
| `search` | query |  |  |

---

## `spans`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api spans get-span-detail` | GET | `/v1/traces/{traceId}/spans/{spanId}` | Get span I/O detail |
| `npx agentmark api spans list-spans` | GET | `/v1/spans` | List spans |
| `npx agentmark api spans list-trace-spans` | GET | `/v1/traces/{traceId}/spans` | List spans for a trace |

### `spans get-span-detail`

Get span I/O detail

```bash
npx agentmark api spans get-span-detail <traceId> <spanId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `traceId` | path | ✓ |  |
| `spanId` | path | ✓ |  |

### `spans list-spans`

List spans

```bash
npx agentmark api spans list-spans [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `trace_id` | query |  |  |
| `type` | query |  |  |
| `status` | query |  |  |
| `name` | query |  |  |
| `model` | query |  |  |
| `min_duration` | query |  |  |
| `max_duration` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `user_id` | query |  |  |
| `session_id` | query |  |  |
| `filter` | query |  |  |

### `spans list-trace-spans`

List spans for a trace

```bash
npx agentmark api spans list-trace-spans <traceId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `traceId` | path | ✓ |  |

---

## `templates`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api templates get-template` | GET | `/v1/templates` | Get template |

### `templates get-template`

Get template

```bash
npx agentmark api templates get-template [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `path` | query | ✓ | File path relative to the agentmark directory (e.g. "my-prompt.prompt.mdx" or "my-data.jsonl") |
| `promptKind` | query |  | Prompt kind hint: image, speech, text, or object |

---

## `traces`

| Command | HTTP | Path | Summary |
|---|---|---|---|
| `npx agentmark api traces get-trace` | GET | `/v1/traces/{traceId}` | Get trace |
| `npx agentmark api traces get-trace-graph` | GET | `/v1/traces/{traceId}/graph` | Get trace graph (deprecated) |
| `npx agentmark api traces ingest-traces` | POST | `/v1/traces` | Ingest traces |
| `npx agentmark api traces list-traces` | GET | `/v1/traces` | List traces |

### `traces get-trace`

Get trace

```bash
npx agentmark api traces get-trace <traceId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `traceId` | path | ✓ |  |
| `fields` | query |  |  |

### `traces get-trace-graph`

Get trace graph (deprecated)

```bash
npx agentmark api traces get-trace-graph <traceId> [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `traceId` | path | ✓ |  |

### `traces ingest-traces`

Ingest traces

```bash
npx agentmark api traces ingest-traces [--remote] [--refresh]
```

### `traces list-traces`

List traces

```bash
npx agentmark api traces list-traces [--remote] [--refresh]
```

| Param | Where | Required? | Notes |
|---|---|---|---|
| `limit` | query |  |  |
| `offset` | query |  |  |
| `start_date` | query |  |  |
| `end_date` | query |  |  |
| `sort_by` | query |  |  |
| `sort_order` | query |  |  |
| `status` | query |  |  |
| `user_id` | query |  |  |
| `model` | query |  |  |
| `dataset_run_id` | query |  |  |
| `session_id` | query |  |  |
| `name` | query |  |  |
| `tag` | query |  |  |
| `commit_sha` | query |  |  |
| `filter` | query |  |  |
