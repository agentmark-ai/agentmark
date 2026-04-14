---
"agentmark-prompt-core": patch
---

Declare `agentmark-templatedx` as a runtime dependency.

`agentmark/prompt_core/template_engines/instances.py` imports
`templatedx` at module load (`from templatedx import TemplateDX`), but the
published `agentmark-prompt-core` distribution did not list
`agentmark-templatedx` in its install-requires. Anyone who installs
`agentmark-prompt-core` from PyPI into a clean environment and imports the
package hits `ModuleNotFoundError: No module named 'templatedx'`.

Previously this was masked by the AgentMark managed-builder's Python package
bundling — every agentmark-* package was copied in as a local-path install
regardless of declared deps, so templatedx was always present. Once that
bundling was removed in favour of standard PyPI installs, the missing
declaration became a runtime crash in deployed handlers.

Fix: add `agentmark-templatedx>=0.1.1` to `[project].dependencies` in
`pyproject.toml`. No code changes, no API surface change.
