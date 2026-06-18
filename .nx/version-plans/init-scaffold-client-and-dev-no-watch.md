---
'@agentmark-ai/cli': minor
---

`agentmark init` now scaffolds the provider-agnostic client (`agentmark.client.ts`
/ `agentmark_client.py`) — loader + evals, no SDK call — so a coding agent no
longer reconstructs it from docs and fabricates the import path. `ApiLoader` is
exported from the `@agentmark-ai/prompt-core/loader-api` SUBPATH, not the package
root; importing it from the root made it `undefined`, so `ApiLoader.local(...)`
threw `Cannot read properties of undefined (reading 'local')` and the dev-entry
crashed at load (onboarding-smoke). Init writes the canonical client verbatim
from the Client setup docs and never clobbers an existing one. The SDK-specific
`dev-entry`/`handler` (their executor wraps your model call) stay agent-authored.
Language is auto-detected on an existing app (package.json → TypeScript,
pyproject/requirements → Python) and prompted for on a greenfield folder
(`--yes`/non-interactive defaults to TypeScript).

`agentmark dev` gains `--no-watch`: don't restart on file changes and exit on a
dev-entry crash. Under `tsx --watch` a dev-entry that throws at load does NOT
exit — tsx prints "waiting for file changes" and keeps the process alive, so a
crash looked like a hung server. `doctor --smoke --boot` now boots with
`--no-watch`, so a crashing client fails fast with the real stack trace instead
of an opaque "did not become ready" timeout; the boot timeout also now appends
the dev server's stderr tail, and accepts `AGENTMARK_DEV_READY_TIMEOUT_MS` as a
CI override for genuinely-slow cold first-compiles.
