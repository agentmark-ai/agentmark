/**
 * Schema Export Coverage
 *
 * Programmatic guard against the bug class that hid `TraceExportParamsSchema`:
 * a test imports a named symbol from `../index`, the test file compiles
 * fine because TypeScript's structural import does not require the symbol
 * to exist at runtime, and the failure only surfaces when the test body
 * actually accesses a property on the (undefined) value.
 *
 * This suite reads every `__tests__/*.ts` file alongside it, extracts every
 * named import that targets `../index` (the public barrel), and asserts
 * each named import resolves to a defined runtime value. A missing schema
 * export now fails *here*, with the symbol name in the message — no need
 * to wait for a downstream test to dereference `undefined`.
 *
 * Why static parsing instead of TypeScript AST: tests in this package
 * already run with vitest. A regex over the import specifier is sufficient
 * because the surface is limited (named imports, single relative path),
 * and adding a TS parser dependency for one guard would over-engineer the
 * check.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as publicApi from '../index';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Targets resolved through the public barrel. Other relative paths
 * (e.g. `../error-envelope`) are deep imports that bypass the barrel
 * and are not the surface this guard protects.
 */
const BARREL_TARGETS = new Set(['../index', '../index.js', '../index.ts']);

/** Files this test should NOT scan — itself, to avoid recursive checks. */
const SELF_FILE = 'schema-export-coverage.test.ts';

interface ImportRecord {
  file: string;
  symbol: string;
  source: string;
}

/**
 * Strip line and block comments from a TS source before regex scanning,
 * so commented-out import statements don't get picked up as live imports.
 * Cheap two-pass replace — string/template literals containing comment
 * markers are vanishingly rare inside an `import { ... } from "..."` clause.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Pull `{ a, b as c }` out of every import statement in `src` whose
 * source path matches one of `BARREL_TARGETS`. Returns the *imported*
 * names (left side of `as`), since those are the symbols the test body
 * actually references.
 */
function extractBarrelImports(file: string, src: string): ImportRecord[] {
  const records: ImportRecord[] = [];
  const cleaned = stripComments(src);
  const importRe =
    /import\s*(?:type\s+)?\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(cleaned)) !== null) {
    const [, namesBlock, source] = match;
    if (!BARREL_TARGETS.has(source)) continue;
    const names = namesBlock
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        // `Original as Alias` — we want the original (the export name on the barrel).
        const asMatch = /^([A-Za-z_$][\w$]*)\s+as\s+[A-Za-z_$][\w$]*$/.exec(s);
        return asMatch ? asMatch[1] : s;
      })
      // Filter out `type` keyword and any non-identifier residue.
      .filter((s) => /^[A-Za-z_$][\w$]*$/.test(s));
    for (const symbol of names) {
      records.push({ file, symbol, source });
    }
  }
  return records;
}

function collectAllBarrelImports(): ImportRecord[] {
  const files = fs
    .readdirSync(here)
    .filter((f) => f.endsWith('.ts') && f !== SELF_FILE);
  const records: ImportRecord[] = [];
  for (const file of files) {
    const src = fs.readFileSync(path.join(here, file), 'utf8');
    records.push(...extractBarrelImports(file, src));
  }
  return records;
}

describe('schema-export-coverage', () => {
  const records = collectAllBarrelImports();

  it('reads at least one named import from a sibling test file', () => {
    // Sanity: if the regex breaks or the directory layout changes, the
    // assertions below would degenerate to a no-op (vacuously true). This
    // test guards the guard.
    expect(records.length).toBeGreaterThan(0);
  });

  it.each(records.map((r) => [`${r.file} → ${r.symbol}`, r] as const))(
    '%s resolves to a defined runtime export',
    (_label, record) => {
      const value = (publicApi as Record<string, unknown>)[record.symbol];
      expect(
        value,
        `Symbol "${record.symbol}" is imported by ${record.file} from ${record.source} but is undefined at runtime. ` +
          `Add the missing export to the appropriate file under src/schemas/ (or src/error-envelope.ts / src/validators.ts) ` +
          `and re-export from src/index.ts.`,
      ).not.toBeUndefined();
    },
  );
});
