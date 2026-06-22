---
'@agentmark-ai/cli': minor
---

`agentmark doctor` now verifies the TypeScript runtime deps are actually
**installed** (resolvable from the project), not merely declared in
`package.json` — closing the gap where `doctor` passed on a project whose
`node_modules` was never created, then `dev` / `doctor --smoke --boot` exited 1
with an opaque "webhook server exited with code 1".

- New check `deps.promptCore`: `@agentmark-ai/prompt-core` is load-bearing (the
  client and dev-entry import it), so a declared-but-uninstalled prompt-core now
  **fails** with a "run `npm install`" fix — caught statically instead of at the
  smoke boot.
- `deps.sdk` now also confirms installation when declared (still a **warn**, not
  a fail — a prompt can render/run via prompt-core without it).

Resolution is anchored at the project via `createRequire`, so it follows
hoisted `node_modules` in a monorepo. Brings the TypeScript deps check to parity
with the Python branch, which already verified importability.
