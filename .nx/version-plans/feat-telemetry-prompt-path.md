---
'@agentmark-ai/prompt-core': patch
'@agentmark-ai/sdk': patch
'@agentmark-ai/cli': patch
'agentmark-prompt-core': patch
'agentmark-sdk': patch
---

Emit the prompt's folder-aware path on trace spans as a new `agentmark.prompt_path` attribute, across the TS and Python SDKs.

A span already carried the prompt's frontmatter `name`, but that is flat: two prompts in different folders (e.g. `agentmark/support/triage.prompt.mdx` and `agentmark/sales/triage.prompt.mdx`) both emit `name: triage`, and the platform's uniqueness constraint is `(app_id, name, parent_path, file_extension)`. Without the path a logged span can't be uniquely resolved back to its prompt. The webhook protocol already carried a `promptPath` field; this threads it through dispatch → runner → span params → the `agentmark.prompt_path` attribute (parallel to `agentmark.prompt_name`), in both prompt-core/sdk (TS) and prompt-core-python/sdk-python (Python). The CLI's `run-prompt` / `run-experiment` now send the real prompt path **relative to the agentmark root** (forward-slashed) instead of the flat name — resolved from `agentmark.json`'s `agentmarkPath` so it's correct wherever the user put the agentmark directory, and matching the key prompts are looked up by (`parent_path` + `name`). Cross-language parity is pinned by mirrored unit tests.
