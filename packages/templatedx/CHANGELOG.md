## 0.4.0 (2026-06-06)

### 🚀 Features

- feat(templatedx): positioned semantic errors via `TemplateDXError` ([#678](https://github.com/agentmark-ai/agentmark/pull/678))

  Semantic errors (unsupported tags, expression evaluation failures, invalid
  imports/attributes, failed import loads) now throw `TemplateDXError`, which
  carries the mdast position of the offending node (`line`/`column`/`offset` +
  `endLine`/`endColumn`/`endOffset`, same 1-based convention as the
  `VFileMessage` syntax errors the parser already throws). Editors and linters
  can map any templatedx error to an exact source range with one code path.
  Error messages are unchanged; `TemplateDXError extends Error`, so existing
  catch sites are unaffected. When an inner node has already located an error,
  outer JSX wrappers re-throw it as-is instead of clobbering the precise
  position with the enclosing element's range.

## 0.3.1 (2026-05-12)

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

## 0.3.0 (2026-04-08)

### 🚀 Features

- Add JSON Schema $ref resolution support: resolveSchemaRefs() and resolveAstSchemaRefs() functions for resolving $ref entries in prompt frontmatter schemas at build time, with transitive resolution, JSON Pointer fragment support, and circular reference detection. ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))
- feat(templatedx): support lowercase XML tags as passthrough in prompt content ([#553](https://github.com/agentmark-ai/agentmark/pull/553), [#517](https://github.com/agentmark-ai/agentmark/issues/517), [#521](https://github.com/agentmark-ai/agentmark/issues/521), [#532](https://github.com/agentmark-ai/agentmark/issues/532), [#544](https://github.com/agentmark-ai/agentmark/issues/544), [#540](https://github.com/agentmark-ai/agentmark/issues/540), [#492](https://github.com/agentmark-ai/agentmark/issues/492))

## 0.2.0 (2026-01-21)

### 🚀 Features

- Fix: security issues ([#449](https://github.com/agentmark-ai/agentmark/pull/449))

# Changelog

## 0.1.0

### Minor Changes

- 39bae0f: Rename npm organization from @agentmark to @agentmark-ai and reset versions for initial release

## 0.0.0

Initial release under `@agentmark-ai` organization.

> **Note:** This package was previously published as `@agentmark/templatedx`.
> See git history for prior changelog entries.
