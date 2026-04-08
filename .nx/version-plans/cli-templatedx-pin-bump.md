---
'@agentmark-ai/cli': patch
---

fix(cli): bump @agentmark-ai/templatedx pin to pick up resolveAstSchemaRefs

The previously pinned templatedx@0.2.0 did not export `resolveAstSchemaRefs`. The CLI's `run-prompt` and `build` commands destructure that symbol from the package and call it, so they crashed with "resolveAstSchemaRefs is not a function" at runtime. Bumping the pin to the republished templatedx (which now ships the export from `schema-ref-resolver.ts`) restores `agentmark run` and `agentmark build`.
