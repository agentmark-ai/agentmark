---
'@agentmark-ai/cli': patch
---

`agentmark generate-types` now defaults `--root-dir` to the project's prompts root (`<agentmarkPath>/agentmark`, read from `agentmark.json`) when neither `--root-dir` nor `--local` is given. Previously the command threw "Either --local or --root-dir must be specified"; run as the docs show it (`agentmark generate-types > agentmark.types.ts`), the shell had already truncated the output file by the time the command threw, silently destroying an existing `agentmark.types.ts`. An explicit `--root-dir` / `--local` still takes precedence.
