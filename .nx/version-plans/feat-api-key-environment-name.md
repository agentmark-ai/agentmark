---
'@agentmark-ai/api-schemas': minor
---

Add optional `environment_name` to the create-API-key request schema and surface `environment_id` on the API-key read schema. Lets a caller mint a key for a specific environment by name (resolved + validated server-side by the gateway) and see which environment a key is bound to. The MCP `create_api_key` tool picks up the new field automatically from the OpenAPI schema.
