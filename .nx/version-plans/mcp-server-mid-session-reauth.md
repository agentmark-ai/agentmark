---
'@agentmark-ai/mcp-server': patch
---

fix(mcp-server): pick up a mid-session `agentmark login` + clearer expired-session error

The server resolved auth once at startup and closed over it, so a token
that expired mid-session kept 401ing even after the user re-ran `agentmark
login` — and "restart the MCP client" isn't an action an agent can take on
its own connection (issue #2657). Two changes:

- The bearer is now resolved fresh per tool call (cheap file read), so a
  re-login is picked up on the very next call with no restart. As
  defense-in-depth, a 401 re-resolves once and retries when the on-disk
  credential changed.
- A surviving 401 caused by an expired session now appends an actionable
  hint ("Run `agentmark login` …") instead of leaving the gateway's
  "Missing auth header" — which is literally true (the client drops the
  header for an expired token) but points away from the real cause
  (issue #2655).
