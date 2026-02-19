---
'@agentmark-ai/cli': minor
---

Show remote trace URL when running `agentmark dev --remote`

When trace forwarding is active, `agentmark run` now prints both the local
and remote trace URLs after each prompt execution, along with a warning that
remote traces may take up to 1 minute to appear.

- Add `org_name` to `DevKeyResponse` interface (returned by the updated platform API)
- Add `orgName` to `ForwardingConfig` so the remote URL can be constructed from the persisted config
- `run-prompt` conditionally shows the remote URL when forwarding is active; falls back to the plain local URL for unlinked sessions
