---
'@agentmark-ai/cli': patch
---

`doctor` / `dev` now tell you to create the client file **at the project root**, not just to run from there. The client-missing remediation previously said only "Run `agentmark dev` from your AgentMark project root," which didn't catch the recurring onboarding mistake of placing `agentmark.client.ts` in a subdirectory (e.g. `src/`) — the CLI loads the client from the project root (`path.join(cwd, ...)`), so a misplaced client makes `dev` fail to boot and `doctor` report `client.file` as failed. The message now reads "Create `agentmark.client.ts` at your AgentMark project root (the CLI loads it from there, not from a subdirectory), then run `agentmark dev` from that directory."
