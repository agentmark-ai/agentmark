---
'@agentmark-ai/prompt-core': minor
'@agentmark-ai/cli': minor
'@agentmark-ai/ai-sdk-v4-adapter': minor
'@agentmark-ai/ai-sdk-v5-adapter': minor
'@agentmark-ai/mastra-v0-adapter': minor
---

Add dataset sampling support: percentage-based sampling with seed reproducibility,
specific row selection via indices/ranges, and train/test split for experiments.
New CLI flags: --sample, --rows, --split, --seed on run-experiment command.

(claude-agent-sdk-v0-adapter was dropped from this plan when restoring it because its bump shipped in a later release.)
