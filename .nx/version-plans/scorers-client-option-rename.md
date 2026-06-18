---
'@agentmark-ai/prompt-core': minor
'agentmark-prompt-core': minor
---

Rename the client constructor option `evals` to `scorers` (TS `createAgentMark`/`AgentMark`, Python `create_agentmark`/`AgentMark`). `evals` is kept as a deprecated alias, honored when `scorers` is omitted. The `EvalRegistry`/`EvalFunction` types and the `get-evals` wire contract are unchanged.
