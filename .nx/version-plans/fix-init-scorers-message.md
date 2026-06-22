---
'@agentmark-ai/cli': patch
---

`agentmark init`'s success line for the scaffolded client now reads "loader +
scorers" instead of "loader + evals". The scaffold itself already emits the
current `scorers` option (the `evals`→`scorers` rename), but the console
message still called it "evals" — contradicting the file it had just written
and teaching the deprecated alias. Cosmetic; the message now matches the
scaffold and the docs.
