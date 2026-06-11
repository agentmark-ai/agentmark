# @agentmark-ai/fallback-adapter (deprecated)

**This package is deprecated.** The neutral client factory and `DefaultAdapter`
now live in [`@agentmark-ai/prompt-core`](https://www.npmjs.com/package/@agentmark-ai/prompt-core):

```ts
import { createAgentMark } from "@agentmark-ai/prompt-core";
```

This package remains as a re-export shim so existing imports keep working,
but new projects should depend on `@agentmark-ai/prompt-core` directly. See
the [client setup guide](https://docs.agentmark.co/getting-started/client-setup).
