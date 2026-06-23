---
'@agentmark-ai/api-schemas': minor
---

Add an optional `display_name` field to the apps API surface. `CreateAppBodySchema` and `UpdateAppBodySchema` now accept a free-form `display_name` (max 100 chars; nullable on update so callers can clear it), and `AppSchema` returns it on responses. `name` remains the URL-stable, unique-per-tenant slug; `display_name` is the human-friendly label shown in the dashboard, falling back to `name` when unset.
