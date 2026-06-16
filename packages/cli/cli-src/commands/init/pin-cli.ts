/**
 * Pins `@agentmark-ai/cli` into the user's project so CI and teammates
 * run the SAME CLI version the project was scaffolded with — without
 * depending on a global install.
 *
 * Why this matters: npm resolves binaries in `node_modules/.bin` before
 * PATH when running scripts, so `npm run dev` uses the pinned local CLI
 * even when a different version is installed globally (or none is). This
 * is the Prisma pattern (`prisma init` adds `@prisma/client` locally).
 *
 * Two edits, both non-destructive:
 *   1. add `@agentmark-ai/cli` to `devDependencies` (skipped if it's
 *      already a dep/devDep — we never downgrade or override a pin the
 *      user chose)
 *   2. add npm scripts that shell to the bare `agentmark` binary. A
 *      script key is only added when ABSENT — we never clobber an
 *      existing `dev`/`build` (common in real projects). When the
 *      preferred name is taken, the namespaced fallback is used.
 *
 * No-op (returns null) when the target has no package.json — a greenfield
 * `agentmark init` in an empty folder has nothing to pin into yet; the
 * skill workflow handles wiring once the user picks a stack.
 */

import fs from "fs-extra";
import path from "path";

const CLI_PACKAGE = "@agentmark-ai/cli";

/** Scripts init wants present, in [preferredKey, fallbackKey, command] form. */
const DESIRED_SCRIPTS: ReadonlyArray<readonly [string, string, string]> = [
  ["dev", "agentmark:dev", "agentmark dev"],
  ["agentmark:build", "agentmark:build", "agentmark build"],
  ["agentmark:experiment", "agentmark:experiment", "agentmark run-experiment"],
];

export interface PinResult {
  /** True when `@agentmark-ai/cli` was added to devDependencies. */
  addedDevDependency: boolean;
  /** Version range written (or the pre-existing one when already present). */
  cliVersionRange: string;
  /** Script keys that were added (in the order written). */
  addedScripts: string[];
}

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  [k: string]: unknown;
};

/**
 * Adds the CLI devDep + npm scripts to the package.json at `targetPath`.
 * `cliVersion` is the bare version of the running CLI (e.g. "0.15.0");
 * it's pinned as a caret range. Returns a summary of what changed, or
 * null when there's no package.json to pin into.
 */
export function pinCliInPackageJson(targetPath: string, cliVersion: string): PinResult | null {
  const pkgPath = path.join(targetPath, "package.json");
  if (!fs.existsSync(pkgPath)) return null;

  let pkg: PackageJson;
  try {
    pkg = fs.readJsonSync(pkgPath) as PackageJson;
  } catch {
    console.warn("⚠️  Could not read package.json — skipping local CLI pin.");
    return null;
  }

  const caretRange = `^${cliVersion}`;
  const existingRange = pkg.dependencies?.[CLI_PACKAGE] ?? pkg.devDependencies?.[CLI_PACKAGE];

  let addedDevDependency = false;
  let cliVersionRange = existingRange ?? caretRange;
  if (!existingRange) {
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}), [CLI_PACKAGE]: caretRange };
    addedDevDependency = true;
    cliVersionRange = caretRange;
  }

  const scripts = pkg.scripts ?? {};
  const addedScripts: string[] = [];
  for (const [preferred, fallback, command] of DESIRED_SCRIPTS) {
    if (Object.values(scripts).includes(command)) continue; // already wired (any key)
    const key = scripts[preferred] === undefined ? preferred : fallback;
    if (scripts[key] !== undefined) continue; // both names taken — leave it alone
    scripts[key] = command;
    addedScripts.push(key);
  }
  if (addedScripts.length > 0) pkg.scripts = scripts;

  if (addedDevDependency || addedScripts.length > 0) {
    fs.writeJsonSync(pkgPath, pkg, { spaces: 2 });
  }

  return { addedDevDependency, cliVersionRange, addedScripts };
}
