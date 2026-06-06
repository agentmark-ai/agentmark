---
"agentmark-templatedx": minor
---

feat(templatedx-python): positioned semantic errors via `TemplateDXError` — parity with the TypeScript package

Semantic errors raised by the transformer (expression evaluation failures,
unsupported/spread attributes) now raise `TemplateDXError`, which carries the
mdast position of the offending node (`line`/`column`/`offset` +
`end_line`/`end_column`/`end_offset`, same 1-based line/column and 0-based
offset convention as `@agentmark-ai/templatedx`). Editors and linters can map
any templatedx error to an exact source range with one code path in both
languages. Error messages are unchanged; `TemplateDXError` subclasses
`ValueError` (what the transformer previously raised), so existing `except`
sites are unaffected. When an inner node has already located an error, outer
JSX wrappers re-raise it as-is instead of clobbering the precise position with
the enclosing element's range.
