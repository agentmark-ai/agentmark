---
"agentmark-sdk": patch
---

fix: set explicit User-Agent on OTLP span exports to bypass Cloudflare BIC

Cloudflare's Browser Integrity Check rejects requests bearing the default
`Python-urllib/*` User-Agent with HTTP 403 (error code 1010). `JsonOtlpSpanExporter`
uses `urllib.request.urlopen` without setting a UA, so every trace export through
a Cloudflare-proxied zone (api.agentmark.co, api-stg.agentmark.co) was silently
rejected before reaching the gateway. Combined with the exporter's bare
`except Exception: return FAILURE`, the failure produced no logs, no metrics,
and no ClickHouse rows — just a complete absence of traces.

The `ApiLoader` path (`/v1/templates` etc.) wasn't affected because it uses
`httpx`, whose default UA `python-httpx/<version>` isn't on the BIC block list.

Set `User-Agent: agentmark-sdk-python/<version>` on every outbound POST. The
version is resolved at import time via `importlib.metadata.version("agentmark-sdk")`
so it stays in lockstep with the installed distribution.
