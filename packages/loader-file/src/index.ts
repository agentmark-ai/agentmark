/**
 * Re-export shim — `FileLoader` was folded into prompt-core. Import from
 * `@agentmark-ai/prompt-core/loader-file` (one fewer package to install);
 * this package keeps existing imports working and will be deprecated in the
 * next major.
 */
export { FileLoader } from "@agentmark-ai/prompt-core/loader-file";
export type { BuiltPrompt, PromptKind } from "@agentmark-ai/prompt-core/loader-file";
