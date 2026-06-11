---
'@agentmark-ai/sdk': patch
---

Restore the `@agentmark-ai/prompt-core` peerDependency floor to `>=1.0.0`.

sdk 2.0.0 published with `>=0.0.0` — the sync pipeline clobbered the
hand-authored floor from app #2824 (sync PR #755). sdk 2.x calls
prompt-core 1.0's client-first `createWebhookRunner`, so the open floor
let installers pair it with prompt-core 0.x and fail at runtime instead
of at install time.
