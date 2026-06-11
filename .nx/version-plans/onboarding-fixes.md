---
'@agentmark-ai/mcp-server': minor
'@agentmark-ai/cli': patch
---

Onboarding fixes from a real-world setup report:

- mcp-server: expired sessions auto-refresh via the `refresh_token` in
  `~/.agentmark/auth.json` (persisted back, CLI-compatible); login hints name
  `npx @agentmark-ai/cli login` (the `agentmark` npm package does not exist)
- cli: doctor labels state the actual condition ("dev server entry missing",
  not "present ⚠"); python dev server gets the project root on PYTHONPATH and
  a per-run bytecode-cache prefix (stale .pyc can no longer mask edits);
  `dev` warns when the linked trace-forwarding endpoint is unreachable;
  dev-config.json is never written outside an agentmark project;
  `doctor --smoke` names missing init_tracing as the likely no-trace cause
