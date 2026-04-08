---
'@agentmark-ai/cli': patch
---

Convert `next.config.ts` to `next.config.mjs` to drop the runtime `typescript` dependency. Fixes the npx UI server crash where Next.js could not parse the `.ts` config because `typescript` was only listed in `devDependencies`.
