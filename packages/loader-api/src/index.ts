/**
 * Re-export shim — `ApiLoader` was folded into prompt-core. Import from
 * `@agentmark-ai/prompt-core/loader-api` (one fewer package to install);
 * this package keeps existing imports working and will be deprecated in the
 * next major.
 */
export { ApiLoader } from "@agentmark-ai/prompt-core/loader-api";
export type {
  ApiLoaderOptions,
  CloudLoaderOptions,
  LocalLoaderOptions,
  PromptKind,
} from "@agentmark-ai/prompt-core/loader-api";
