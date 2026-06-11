/**
 * `@agentmark-ai/prompt-core/loader-api` — the API-backed prompt loader
 * (local `agentmark dev` server or AgentMark Cloud). Folded in from the
 * standalone `@agentmark-ai/loader-api` package, which is now a re-export
 * shim of this entry. A SUBPATH on purpose: keeps the main barrel free of
 * loader plumbing for browser/worker consumers.
 */
export { ApiLoader } from "./loaders/api-loader";
export type {
  ApiLoaderOptions,
  CloudLoaderOptions,
  LocalLoaderOptions,
  PromptKind,
} from "./loaders/api-loader";
