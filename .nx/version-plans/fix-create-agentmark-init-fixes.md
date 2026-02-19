---
'create-agentmark': patch
'@agentmark-ai/cli': patch
---

Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations

- create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
- cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from
