---
'@agentmark-ai/mcp-server': patch
'@agentmark-ai/cli': patch
---

Harden error parser to read gateway's canonical nested error envelope
(`{ error: { code, message } }`). Previous flat-string shape is still
accepted as a fallback.
