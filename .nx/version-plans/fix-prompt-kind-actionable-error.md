---
'@agentmark-ai/cli': patch
---

`doctor` / `build` / `dev` now give an actionable error when a prompt's
frontmatter has no `*_config` block. `determinePromptKind` threw the terse
"Could not determine prompt kind from frontmatter", and `doctor` overrode it
with an equally terse "no *_config block in frontmatter" — neither showed the
correct shape. An onboarding agent that wrote `metadata: { model: { name } }`
(a convention from other frameworks) hit a dead end and couldn't self-correct,
so the prompt failed to parse and the run broke (onboarding-smoke #2949). The
error now names the valid blocks (text_config / object_config / image_config /
speech_config) and the shape (`text_config:` with `model_name: <provider/model>`,
not top-level and not under `metadata`/`model`); `doctor` surfaces it verbatim.
