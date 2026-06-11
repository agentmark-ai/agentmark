/**
 * `@agentmark-ai/prompt-core/loader-file` — the filesystem prompt loader.
 * Folded in from the standalone `@agentmark-ai/loader-file` package, which is
 * now a re-export shim of this entry. A SUBPATH on purpose: it imports node
 * builtins (fs/path/readline), which must stay out of the main barrel for
 * browser/worker consumers.
 */
export { FileLoader } from "./loaders/file-loader";
export type { BuiltPrompt, PromptKind } from "./loaders/file-loader";
