---
"agentmark-prompt-core": patch
"agentmark-pydantic-ai-v0": patch
"agentmark-claude-agent-sdk-v0": patch
---

Accumulated fixes across the Python packages since the last release:

- `agentmark-prompt-core`: Implement `FileLoader.load()` for Python (mirrors the
  TS FileLoader contract — `oss/agentmark/packages/prompt-core-python/src/agentmark/prompt_core/loaders.py`).
  Dataset paths resolve the same way from `FileLoader` and `ApiLoader` frontmatter,
  using the configurable `basePath`.
- `agentmark-pydantic-ai-v0`: Wrapper spans record the experiment iteration's
  template variables on the wrapper span as `agentmark.props`, matching the
  TS adapter behavior. This populates `result.props` in the normalizer output,
  which the trace drawer's Test Prompt button reads to repopulate variables.
  `instrument-all` is invoked at the adapter boundary instead of per call site.
- `agentmark-claude-agent-sdk-v0`: Correct the AgentMark import path so the
  adapter works when imported from a venv-installed package (previously only
  worked in-tree). Wrapper-span attribute handling matches the pydantic-ai
  adapter (`agentmark.props` for template variables).
