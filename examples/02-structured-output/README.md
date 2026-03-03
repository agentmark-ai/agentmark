# 02 — Structured Output

Extract typed JSON from unstructured text using a JSON Schema.

## The prompt

`extract-contacts.prompt.mdx` uses `object_config` instead of `text_config`. The `schema` field defines the exact shape of the output — the LLM is constrained to return valid JSON matching it.

## Run it

```bash
agentmark run-prompt agentmark/extract-contacts.prompt.mdx

agentmark run-prompt agentmark/extract-contacts.prompt.mdx \
  --props '{"text": "Call Sarah at 555-1234 or email her at sarah@example.com"}'
```

## What to notice

- `object_config` replaces `text_config` — tells AgentMark this prompt returns structured data
- The `schema` field is standard JSON Schema — works with any validation library
- `agentmark generate-types` can produce TypeScript types from this schema
