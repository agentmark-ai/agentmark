---
'@agentmark-ai/cli': patch
---

fix(cli): point `agentmark dev` setup errors at the setup skill + client-setup docs

When `agentmark dev` could not find `agentmark.client.ts` / `agentmark_client.py`
or a dev-server entry, it told users to "run create-agentmark" — the step they
had usually already run. Those files are written by the editor's "Set up
AgentMark in this project" skill, not the scaffolder, so the old message pointed
people at the wrong fix. The errors now name that skill and link the
client-setup guide.
