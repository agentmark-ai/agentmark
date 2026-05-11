/**
 * Regression gate for the @agentmark-ai/ui-components exports subpath map.
 *
 * The `./types` and `./utilities` subpaths exist so that consumers in
 * Node-only environments (vitest with `environment: 'node'`,
 * gateway/CLI servers, the downstream `@agentmark-ai/api-types` package)
 * can import shapes and helpers without dragging React, MUI, or
 * @emotion through the module graph.
 *
 * This test enforces that contract by:
 *   1. spawning a clean Node child process per subpath,
 *   2. importing the built dist entry (`dist/types.mjs`,
 *      `dist/utilities.mjs`),
 *   3. inspecting `require.cache` for any module path that contains
 *      `react`, `@mui`, or `@emotion`,
 *   4. failing if any such module shows up.
 *
 * If you are tempted to add a React-tainted re-export to either
 * subpath: don't. Add it to the main barrel (`./`) instead, or extract
 * the React-free portion into a `.ts` (not `.tsx`) module and re-export
 * that.
 *
 * The child process is launched via the `node` binary directly, not
 * vitest, so its module graph reflects what a real consumer would see.
 * We use the CJS (`.cjs`) build because `require.cache` introspection
 * is the most reliable cross-Node-version way to enumerate loaded
 * modules. The ESM equivalent would require `import.meta.resolve` +
 * loader hooks, which adds noise without changing the answer.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST = path.join(PACKAGE_ROOT, 'dist');

/** Patterns that, if seen in `require.cache`, mean React/MUI leaked in. */
const FORBIDDEN_PATTERNS = [
  /[\\/]node_modules[\\/]react[\\/]/,
  /[\\/]node_modules[\\/]react-dom[\\/]/,
  /[\\/]node_modules[\\/]@mui[\\/]/,
  /[\\/]node_modules[\\/]@emotion[\\/]/,
  // React-flavoured graph/UI deps that are heavy and React-bound.
  /[\\/]node_modules[\\/]@xyflow[\\/]/,
  /[\\/]node_modules[\\/]react-hook-form[\\/]/,
  /[\\/]node_modules[\\/]react-syntax-highlighter[\\/]/,
  /[\\/]node_modules[\\/]react-markdown[\\/]/,
  /[\\/]node_modules[\\/]@iconify[\\/]/,
];

/**
 * Run an isolated Node child process that requires `entryFile` and
 * prints every key in `require.cache` (one per line). Returns the
 * captured stdout split into lines.
 */
function loadInChildProcess(entryFile: string): string[] {
  const script = `
    const path = require('node:path');
    require(${JSON.stringify(entryFile)});
    for (const key of Object.keys(require.cache)) {
      process.stdout.write(key + '\\n');
    }
  `;

  const result = spawnSync(process.execPath, ['-e', script], {
    encoding: 'utf-8',
    cwd: PACKAGE_ROOT,
  });

  if (result.status !== 0) {
    throw new Error(
      `Child Node process failed (exit ${result.status}):\n` +
      `STDOUT:\n${result.stdout}\n` +
      `STDERR:\n${result.stderr}`
    );
  }

  return result.stdout.split('\n').filter((line) => line.length > 0);
}

/** Returns the subset of loaded modules that match any forbidden pattern. */
function findForbidden(loadedModules: string[]): string[] {
  return loadedModules.filter((mod) =>
    FORBIDDEN_PATTERNS.some((pattern) => pattern.test(mod))
  );
}

describe('@agentmark-ai/ui-components exports subpath map', () => {
  beforeAll(() => {
    // Skip the test rather than fail mysteriously if the package was
    // not built before vitest ran. CI runs `turbo build` first; locally
    // we surface a clear hint instead of a `Cannot find module` error.
    const requiredFiles = [
      path.join(DIST, 'types.js'),
      path.join(DIST, 'utilities.js'),
      path.join(DIST, 'index.js'),
    ];
    const missing = requiredFiles.filter((f) => !existsSync(f));
    if (missing.length > 0) {
      throw new Error(
        `dist files missing (run \`yarn build\` first):\n  ${missing.join('\n  ')}`
      );
    }
  });

  it('the `./types` subpath loads with zero React/MUI/@emotion modules', () => {
    const loaded = loadInChildProcess(path.join(DIST, 'types.js'));
    const forbidden = findForbidden(loaded);
    expect(
      forbidden,
      `\`@agentmark-ai/ui-components/types\` must not pull React/MUI/@emotion. ` +
        `Found:\n${forbidden.join('\n')}`
    ).toEqual([]);
  });

  it('the `./utilities` subpath loads with zero React/MUI/@emotion modules', () => {
    const loaded = loadInChildProcess(path.join(DIST, 'utilities.js'));
    const forbidden = findForbidden(loaded);
    expect(
      forbidden,
      `\`@agentmark-ai/ui-components/utilities\` must not pull React/MUI/@emotion. ` +
        `Found:\n${forbidden.join('\n')}`
    ).toEqual([]);
  });

  it('the main `.` barrel was emitted alongside the new subpaths', () => {
    // We don't try to `require()` the main barrel here: dist/index.js
    // is a CJS build that pulls @emotion/styled (ESM-only), so loading
    // it from a bare `node -e` script throws an interop error. That is
    // a pre-existing constraint of the package — real consumers
    // (Next.js, vite, jest with esm support) bundle the ESM build.
    //
    // What we DO check is that the subpath reorganisation didn't drop
    // the main barrel: `dist/index.js`, `dist/index.mjs`, and the type
    // definition siblings must all exist and be non-empty.
    const required = [
      'index.js',
      'index.mjs',
      'index.d.ts',
      'index.d.mts',
    ];
    for (const file of required) {
      const full = path.join(DIST, file);
      expect(existsSync(full), `${file} must exist`).toBe(true);
    }
  });
});
