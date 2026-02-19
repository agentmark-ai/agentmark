## 0.9.0 (2026-02-19)

### 🚀 Features

- Add seamless pull-models flow with provider/model format ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - prompt-core: validate model names against builtInModels allow-list at load time
  - ai-sdk-v4-adapter, ai-sdk-v5-adapter: add registerProviders() and getModelFunction() for seamless provider/model string resolution; add speech model support
  - claude-agent-sdk-adapter, mastra-v0-adapter: update model registry to use provider/model format
  - create-agentmark: scaffold new projects with builtInModels in provider/model format and registerProviders wiring
- Show remote trace URL when running `agentmark dev --remote` ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  When trace forwarding is active, `agentmark run` now prints both the local
  and remote trace URLs after each prompt execution, along with a warning that
  remote traces may take up to 1 minute to appear.
  - Add `org_name` to `DevKeyResponse` interface (returned by the updated platform API)
  - Add `orgName` to `ForwardingConfig` so the remote URL can be constructed from the persisted config
  - `run-prompt` conditionally shows the remote URL when forwarding is active; falls back to the plain local URL for unlinked sessions

### 🩹 Fixes

- Fix agentmark.json missing from initial git commit and duplicate dev-config.json locations ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - create-agentmark: move initGitRepo() to main() so it runs after agentmark.json is written, ensuring all files land in the initial commit
  - cli: add findProjectRoot() that walks up to find agentmark.json, anchoring .agentmark/dev-config.json there as a single source of truth regardless of which directory agentmark dev is run from
- Fix pull-models UX: require at least one model selection, show accurate success message, and remove prompt.schema.json auto-generation ([#499](https://github.com/agentmark-ai/agentmark/pull/499))

  - Add `min: 1` to the models multiselect so users can't accidentally confirm with zero selections
  - Replace generic "Models pulled successfully." with "Added N model(s): ..." to accurately reflect what changed
  - Remove automatic `prompt.schema.json` regeneration from `pull-models` (schema generation was not reliably useful without additional IDE setup)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0
- Updated @agentmark-ai/prompt-core to 0.2.0

## 0.8.2 (2026-02-19)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#495](https://github.com/agentmark-ai/agentmark/pull/495))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2
- Updated @agentmark-ai/prompt-core to 0.1.2

## 0.8.1 (2026-02-17)

### 🩹 Fixes

- Sync: update from upstream monorepo ([#492](https://github.com/agentmark-ai/agentmark/pull/492))

## 0.8.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#486](https://github.com/agentmark-ai/agentmark/pull/486))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#486](https://github.com/agentmark-ai/agentmark/pull/486))
- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.6

## 0.7.0 (2026-02-14)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#482](https://github.com/agentmark-ai/agentmark/pull/482))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.5

## 0.6.0 (2026-02-13)

### 🚀 Features

- Add --remote flag for one-step platform connection (login + tunnel + forwarding) ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#477](https://github.com/agentmark-ai/agentmark/pull/477))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.4

## 0.5.3 (2026-02-13)

### 🩹 Fixes

- Increase API server body limit to 10mb for OTLP trace payloads ([#475](https://github.com/agentmark-ai/agentmark/pull/475))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.3

## 0.5.2 (2026-02-13)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.2

## 0.5.1 (2026-02-13)

### 🩹 Fixes

- Move model-registry to OSS as @agentmark-ai/model-registry, update CLI to use import syntax ([#471](https://github.com/agentmark-ai/agentmark/pull/471))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/model-registry to 0.2.0

## 0.5.0 (2026-02-04)

### 🚀 Features

- Use cloudflared instead of local tunnel ([#459](https://github.com/agentmark-ai/agentmark/pull/459))

## 0.4.1 (2026-01-28)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.1

## 0.4.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/ui-components to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/shared-utils to 0.3.0
- Updated @agentmark-ai/templatedx to 0.2.0
- Updated @agentmark-ai/templatedx to 0.2.0

# Changelog

## 0.3.0

### Minor Changes

- 97abbdd: Add claude agent sdk adapter
- a4a1d95: Support mcp server

### Patch Changes

- Updated dependencies [97abbdd]
  - @agentmark-ai/shared-utils@0.2.0

## 0.2.0

### Minor Changes

- 03c4c2c: Feat: Timeline view

## 0.1.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/shared-utils@0.1.0
  - @agentmark-ai/prompt-core@0.1.0
  - @agentmark-ai/templatedx@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/cli`.
> See git history for prior changelog entries.
