## 1.1.0 (2026-04-08)

### 🚀 Features

- Rename trace API to span/observe semantics. **Breaking** for consumers of the previous tracing surface. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

  - Renamed `trace` → `span`
  - Renamed `TraceContext` → `SpanContext`, `TraceOptions` → (folded into `SpanOptions`), `TraceResult` → `SpanResult`
  - Added `observe` higher-order helper, `SpanKind` enum, and `serializeValue` utility
  - New internal modules `trace/traced.ts` and `trace/serialize.ts`

  This change landed in source via sync #535 (2026-04-03) but was missed by the upstream-sync release pipeline — no version plan was generated alongside the source change, so the bump never made it onto npm. Consumers on `@agentmark-ai/sdk@1.0.7` should migrate `trace`/`TraceContext` imports to `span`/`SpanContext` when upgrading to this release.

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.4.0

## 1.0.7 (2026-03-18)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.3.0

## 1.0.6 (2026-02-19)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.2.0

## 1.0.5 (2026-02-19)

### 🧱 Updated Dependencies

- Updated @agentmark-ai/prompt-core to 0.1.2

## 1.0.4 (2026-02-14)

### 🩹 Fixes

- Show webhook secret in --remote banner, simplify generated npm scripts to single `agentmark` command, and fix duplicate trace exporter in SDK. ([#479](https://github.com/agentmark-ai/agentmark/pull/479))

# Changelog

## 1.0.2

### Patch Changes

- 00fd34d: fix: missing dataset path in metadata

## 1.0.1

### Patch Changes

- 53c4b70: Fix: workspace refs

## 1.0.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

### Patch Changes

- Updated dependencies [39bae0f]
  - @agentmark-ai/loader-api@0.1.0

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/sdk`.
> See git history for prior changelog entries.
