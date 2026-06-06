---
'@agentmark-ai/templatedx': minor
---

feat(templatedx): positioned semantic errors via `TemplateDXError`

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
