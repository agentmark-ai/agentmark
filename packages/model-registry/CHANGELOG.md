## 0.2.1 (2026-04-08)

### 🩹 Fixes

- Republish with the compiled `dist/` output. The previously published `0.2.0` tarball shipped only `src/index.ts` and had `main: "src/index.ts"` in its manifest, so consumers running on Node ≥22.6 hit `ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING` because Node refuses to type-strip TypeScript files inside `node_modules`. The package source was corrected in a later sync but never republished. This release contains `dist/index.js` (CJS) plus `dist/index.d.ts` and a manifest pointing at the compiled entry, so consumers like `@agentmark-ai/cli` work on modern Node again.

## 0.2.0 (2026-02-13)

### 🚀 Features

- Move model-registry to OSS as @agentmark-ai/model-registry, update CLI to use import syntax ([#471](https://github.com/agentmark-ai/agentmark/pull/471))