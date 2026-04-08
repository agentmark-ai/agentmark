---
'@agentmark-ai/fallback-adapter': patch
---

fix(types): wrap `format()` return type in `Awaited<...>` so consumers receive the resolved value type instead of a nested Promise. Single-line type-only fix to `DefaultObjectPrompt.format` in `src/index.ts` — no runtime behavior change.
