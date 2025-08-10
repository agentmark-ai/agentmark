# Webhook/Adapter Consolidation

## Overview

We should remove the extra "vercel-ai-v4-webhook-helper" and consolidate it with the vercel-ai-v4-adapter.

## Acceptance Criteria

- [ ] We should move the webhook-helper logic into the adapter, specifically at a @vercel-ai-v4-adapter/runner path.
- [ ] All logic should still work as previously expected.
- [ ] The return types for each function should come from a shared set of types that get added in @agentmark-core.
- [ ] Any common logic should also get added in @agentmark-core.
- [ ] We should set the standard for new [adapter]/runner classes such that they all follow the same interface/pattern.
- [ ] We should add tests to verify the runner works as expected.
- [ ] We should completely remove the old webhook-helper as it's no longer used.