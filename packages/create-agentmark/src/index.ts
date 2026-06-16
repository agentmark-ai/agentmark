import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * `npm create agentmark` / `npx create-agentmark` — a thin wrapper that
 * delegates to `agentmark init`, forwarding every argument verbatim.
 *
 * The scaffold logic (agentmark.json, prompts dir, MCP wiring, local CLI
 * pin, skill install) lives in `@agentmark-ai/cli`. This package carries
 * NO dependency on it — instead it invokes the CLI through `npx`, which
 * reuses a globally- or locally-installed `@agentmark-ai/cli` when present
 * and downloads it on demand otherwise. That keeps `npm create agentmark`
 * a tiny, dependency-free scaffolder: running it never drags the CLI's
 * full tree (Next.js, MUI, the native better-sqlite3 build) into the
 * install just to print a setup prompt. `agentmark init` and
 * `npm create agentmark` still produce IDENTICAL output because both run
 * the same CLI code.
 */

const CLI_PACKAGE = "@agentmark-ai/cli";

export interface RunDeps {
  /** Spawns a child process. Injectable for tests. Returns its exit status. */
  spawn?: (
    command: string,
    args: string[],
  ) => { status: number | null; error?: Error };
}

/**
 * Runs `agentmark init` via npx with the forwarded args.
 *
 * `-y` skips npx's install confirmation (headless/CI). With NO version
 * specifier, npx reuses an already-installed `@agentmark-ai/cli` (global or
 * local `node_modules/.bin`) and only fetches the latest when none is
 * found — so a user who already installed the CLI globally pays no
 * download.
 *
 * On Windows the npx executable is `npx.cmd`, which Node can't spawn
 * directly without a shell; anyone running `npm create agentmark`
 * necessarily has npm/npx on PATH, so resolving it through the shell there
 * is safe. Returns the child's exit code (1 when npx itself can't be
 * launched, or the child reports no status — e.g. a signal kill).
 */
export const run = (
  argv: string[] = process.argv.slice(2),
  deps: RunDeps = {},
): number => {
  const spawn =
    deps.spawn ??
    ((command, args) =>
      spawnSync(command, args, {
        stdio: "inherit",
        shell: process.platform === "win32",
      }));

  const result = spawn("npx", ["-y", CLI_PACKAGE, "init", ...argv]);

  if (result.error) {
    console.error(
      `create-agentmark could not run ${CLI_PACKAGE} via npx (${result.error.message}).\n` +
        "Install the CLI and run init directly:\n" +
        `  npm install -g ${CLI_PACKAGE} && agentmark init`,
    );
    return 1;
  }
  return result.status ?? 1;
};

/**
 * True only when this module is the process entry (the bin), not when a
 * test imports it. Both sides are realpath'd because npm/npx invoke bins
 * through a `node_modules/.bin` symlink — `process.argv[1]` is the symlink
 * while `import.meta.url` is the resolved real path, so a naive compare
 * never matches and the wrapper would no-op (the 1.0.0 bug class).
 */
const isDirectlyInvoked = (): boolean => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryReal = pathToFileURL(realpathSync(entry)).href;
    const selfReal = pathToFileURL(realpathSync(fileURLToPath(import.meta.url))).href;
    return entryReal === selfReal;
  } catch {
    return false;
  }
};

if (isDirectlyInvoked()) {
  process.exit(run());
}
