---
'@agentmark-ai/cli': patch
---

Two onboarding CLI fixes:

- `pull-models` now prints the `@ai-sdk` `import` + `.registerProviders({...})` provider-setup reminder only when the project actually depends on `@ai-sdk/*` (Vercel AI SDK / Mastra). Raw provider-SDK projects (`openai`, `@anthropic-ai/sdk`) and Python projects get neutral executor guidance instead, rather than being told to register packages they do not have.
- `doctor` / `dev` "client not set up" guidance now leads with the concrete client-setup recipe (which writes the client, dev-entry, and handler) instead of leading with "ask your coding agent to Set up AgentMark", which is circular when an agent is already running that setup.
