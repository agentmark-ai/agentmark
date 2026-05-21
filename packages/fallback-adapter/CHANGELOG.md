## 1.0.6 (2026-05-21)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.5.0

## 1.0.5 (2026-05-12)

### 🩹 Fixes

- **License change: MIT → AGPL-3.0-or-later.** ([#583](https://github.com/agentmark-ai/agentmark/pull/583))

  The runtime code is byte-identical to the previous patch release — only the
  `LICENSE.md` file and the `license` field in each `package.json` change. Bumping
  as a patch (not a major) because no compile/runtime behavior is affected.

  **Downstream impact (please read before upgrading):** AGPL-3.0 has copyleft
  and network-use obligations that MIT does not. Consumers using these packages
  in proprietary or SaaS products may need to evaluate compatibility before
  upgrading. Users who need the MIT terms can pin to the last MIT-licensed
  release of each package.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/loader-file to 0.1.1
- Updated @agentmark-ai/prompt-core to 0.4.2

## 1.0.4 (2026-04-14)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.1

## 1.0.3 (2026-04-08)

### 🩹 Fixes

- fix(types): wrap `format()` return type in `Awaited<...>` so consumers receive the resolved value type instead of a nested Promise. Single-line type-only fix to `DefaultObjectPrompt.format` in `src/index.ts` — no runtime behavior change. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 1.0.2 (2026-01-21)

This was a version bump only for @agentmark-ai/fallback-adapter to align it with other projects, there were no code changes.

# Changelog

## 1.0.1

### Patch Changes

- 53c4b70: Fix: workspace refs
- Updated dependencies [53c4b70]
  - @agentmark-ai/prompt-core@0.1.1

## 1.0.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/prompt-core@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/fallback-adapter`.
> See git history for prior changelog entries.
