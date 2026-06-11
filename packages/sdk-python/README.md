# AgentMark SDK (Python)

Tracing, scoring, and webhook-runner span hooks for AgentMark.

```python
from agentmark.sdk import AgentMarkSDK  # preferred namespace import
# from agentmark_sdk import AgentMarkSDK  # flat name, still supported

sdk = AgentMarkSDK(api_key="...", app_id="...")
sdk.init_tracing()
```

## TypeScript parity roadmap

Known gaps vs `@agentmark-ai/sdk`, tracked as roadmap items (not silent drift):

- **`run_experiment` (Path A in-process experiments)** — TS `AgentMarkSDK.runExperiment`
  (dataset → task → evaluators → regression gate → JUnit) has no Python
  equivalent yet; Python currently covers Path B (cloud-dispatched
  experiments via `create_webhook_runner`) only.
- **Import path**: `agentmark.sdk` is the preferred namespace import going
  forward; the flat `agentmark_sdk` name remains supported.

## License

MIT
