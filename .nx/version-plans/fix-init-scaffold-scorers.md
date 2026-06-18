---
'@agentmark-ai/cli': patch
---

`agentmark init` now scaffolds the client with the current `scorers` option
instead of the deprecated `evals` alias. The scaffold landed just before the
`evals`-to-`scorers` rename, so fresh projects were generated against the old
option name. It still ran (the alias is honored), but it taught the wrong API
and mismatched the docs. New scaffolds emit `scorers`.
