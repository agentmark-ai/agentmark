---
'@agentmark-ai/cli': patch
---

fix(cli): agentmark dev runs the adapter in local mode, not cloud

`agentmark dev` forwarded the project env, including `AGENTMARK_API_KEY` /
`AGENTMARK_APP_ID` from a local `.env`, to the spawned adapter. The client read
the presence of those creds as "use cloud", so the adapter loaded deployed
prompts and datasets from `api.agentmark.co` and bypassed the local files the
dev server serves, with locally resolved datasets coming through empty. The
spawn now strips the cloud creds and any cloud `AGENTMARK_BASE_URL` from the
adapter env and pins `AGENTMARK_DEV_SERVER` to the local API server, for both
the Python and TypeScript adapters, logging a notice when cloud creds are
detected. Trace forwarding to prod is unaffected: it runs off this process's
`TraceForwarder` using `agentmark link` creds, not the adapter's env.
