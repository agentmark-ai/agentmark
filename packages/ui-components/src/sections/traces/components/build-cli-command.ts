/**
 * Build a copy-pasteable `agentmark run-prompt` command for replaying a span's
 * input in the user's terminal.
 *
 * The output is single-line and POSIX-shell-safe. Both the file path and the
 * props payload go through `singleQuoteShellEscape` — paths with spaces,
 * backslashes, or shell metacharacters (legitimate on macOS/Windows) and
 * props strings containing single quotes all survive a copy-paste. We
 * deliberately avoid the platform's URL-routing approach because OSS users
 * don't have a hosted prompt editor — the terminal IS the playground.
 */

// `path/to/...` rather than `<path-to-...>` — angle brackets are shell
// redirects, so the literal placeholder must not contain them or pasting the
// command into bash redirects stdout to a file named `path-to-prompt.prompt.mdx`.
const FILE_PATH_PLACEHOLDER = "path/to/your.prompt.mdx";

interface BuildCliCommandOptions {
  /** Resolved relative path inside `agentmark/`, or null when unresolved. */
  filePath: string | null;
  /** Props (template variables) to pass via `--props`. Null/empty omits the flag. */
  props: Record<string, unknown> | null;
}

/**
 * POSIX single-quote escape: wraps in single quotes and replaces inner `'`
 * with `'\''` so the shell sees a single concatenated argument.
 */
export function singleQuoteShellEscape(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * Compose `agentmark run-prompt '<path>' [--props '<json>']`.
 *
 * `filePath` may be null when the resolver couldn't map the prompt name to a
 * file — in that case a placeholder is substituted so the user can paste the
 * command and patch the path themselves.
 */
export function buildRunPromptCommand({ filePath, props }: BuildCliCommandOptions): string {
  const pathToken = filePath && filePath.length > 0 ? filePath : FILE_PATH_PLACEHOLDER;
  const parts = ["agentmark", "run-prompt", singleQuoteShellEscape(pathToken)];

  if (props && Object.keys(props).length > 0) {
    const json = JSON.stringify(props);
    parts.push("--props", singleQuoteShellEscape(json));
  }

  return parts.join(" ");
}

export const RUN_PROMPT_PATH_PLACEHOLDER = FILE_PATH_PLACEHOLDER;
