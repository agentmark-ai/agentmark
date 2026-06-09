---
'@agentmark-ai/shared-utils': patch
---

fix(shared-utils): toFrontMatter emits valid YAML for values needing escaping

`toFrontMatter` built the prompt frontmatter by interpolating each value
directly into `key: value` lines, with no quoting or escaping. When a
`test_settings.props` value came from a trace input that was page markdown, the
emitted YAML was invalid: a value starting with `![](...)` was read as a YAML
tag, embedded double quotes became a second scalar, and newlines broke the block
mapping. Reopening such a prompt in the editor failed with
`YAMLException: expected <block end>, but found '<scalar>'`. The function now
serializes with `js-yaml`'s `dump`, the same library templatedx uses to read the
frontmatter back, so every value round-trips: special-character scalars are
quoted and multi-line strings use block scalars. Empty input still renders as
bare `---` fences.
