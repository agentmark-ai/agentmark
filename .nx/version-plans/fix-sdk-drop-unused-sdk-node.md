---
'@agentmark-ai/sdk': patch
---

Remove the unused `@opentelemetry/sdk-node` dependency. The SDK long ago
migrated from `NodeSDK` to a dedicated `NodeTracerProvider` (see the comments in
`trace/tracing.ts`), but `sdk-node` was left declared in `package.json` while
being imported nowhere. It was the sole source of the gRPC OTLP exporters
(`@grpc/grpc-js` → `@grpc/proto-loader` → `protobufjs`), so a fresh
`npm install @agentmark-ai/sdk` pulled `protobufjs` and reported 26 known
vulnerabilities (24 moderate, 2 high) — every one transitively via `protobufjs`,
none of it ever used.

Dropping the unused dep takes the runtime tree from 198 → 115 packages and
clears all 26 (`npm audit --omit=dev` → 0). Tracing is unaffected: the SDK
exports over HTTP via `@opentelemetry/exporter-trace-otlp-http` and builds its
provider from `@opentelemetry/sdk-trace-node`, both of which remain. Verified by
`tsc --noEmit` (clean) and the full vitest suite (164 tests passing).
