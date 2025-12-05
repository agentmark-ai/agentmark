export { AgentMarkSDK } from "./agentmark";
export { trace, component, getActiveTraceId, getActiveSpanId } from "./trace";

// Re-export ApiLoader from @agentmark/loader-api for convenience
export { ApiLoader } from "@agentmark/loader-api";
export type { CloudLoaderOptions, LocalLoaderOptions } from "@agentmark/loader-api";