---
"@agentmark-ai/ai-sdk-shared": minor
"@agentmark-ai/ai-sdk-v4-adapter": patch
"@agentmark-ai/ai-sdk-v5-adapter": patch
"@agentmark-ai/loader-api": patch
"agentmark-pydantic-ai-v0": patch
---

Fix the published type surface that the client-setup docs validation exposed:

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
