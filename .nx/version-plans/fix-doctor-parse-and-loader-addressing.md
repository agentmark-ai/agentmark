---
'@agentmark-ai/cli': patch
'@agentmark-ai/prompt-core': patch
---

doctor now parses each prompt's TemplateDX body (not just frontmatter), so malformed templates (e.g. a blank line inside a tag) fail at doctor instead of surfacing later as a misleading dev-server error; the dev server's /v1/templates endpoint distinguishes a parse error (400 template_parse_error, carrying the parse message) from a genuinely missing file (404) instead of collapsing both into "File not found or invalid"; ApiLoader 404s on a bare prompt slug now hint the canonical `<name>.prompt.mdx` path.
