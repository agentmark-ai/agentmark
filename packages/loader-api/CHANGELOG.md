## 0.1.2 (2026-06-07)

### 🩹 Fixes

- Fix the published type surface that the client-setup docs validation exposed: ([#685](https://github.com/agentmark-ai/agentmark/pull/685))

  **ai-sdk-shared (minor — first publish):**
  - Drop `private: true`. The v4/v5 adapters' published `.d.ts` files import the
    registry/adapter-core types from this package, so consumers' `tsc` could
    never resolve them — `registerProviders`/`registerModels` appeared missing
    under strict mode. Publishing the package (and depending on it normally)
    makes the published declarations resolvable.

  **ai-sdk-v4-adapter / ai-sdk-v5-adapter (patch):**
  - `@agentmark-ai/ai-sdk-shared` moves from a bundled devDependency to a
    regular dependency (`>=0.0.0`, the same range convention the sdk uses for
    its internal peers — it resolves to the workspace in both the monorepo and
    the standalone tree despite their version drift). Runtime behavior is
    unchanged — the same code now loads via a resolvable module instead of
    being inlined, and the emitted type declarations stop dangling.

  **loader-api (patch):**
  - `FetchTemplateOptions.cache` is now optional, so `ApiLoader#load` stays
    assignable to the adapters' `LoaderLike` contract (callers pass
    `AdaptOptions`, which has no `cache` key). Omitting `cache` skips caching —
    the same runtime behavior those callers always got.

  **agentmark-pydantic-ai-v0 (patch):**
  - Streamed text no longer drops the opening token(s): pydantic-ai delivers
    the first chunk of a text part inside `PartStartEvent` (single-chunk
    responses arrive ONLY there), and `_stream_text` previously forwarded
    `TextPartDelta` events alone. The part-start content now yields a delta
    too.

## 0.1.1 (2026-05-12)

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

# Changelog

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/loader-api`.
> See git history for prior changelog entries.
