---
"@agentmark-ai/cli": major
---

**BREAKING:** Remove `@agentmark-ai/connect` package and the CLI `--remote` flag.

- The `@agentmark-ai/connect` WebSocket client package is removed from the workspace. The package's last published version on npm (`0.2.1`) remains available for existing consumers but will not receive further updates.
- `agentmark dev --remote` is removed; the local dev server no longer establishes a websocket back to the cloud platform. Use platform-managed deployments instead (see spec 053 / `/v1/deployments`).
- The associated `JobHandler` and `WebSocketClient` imports in `cli-src/commands/dev.ts` are removed; the dev command no longer accepts `remote` in its options.
