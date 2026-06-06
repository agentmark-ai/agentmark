/**
 * Structural meta-gate: every package that implements the Executor protocol
 * MUST exercise the conformance suite in its tests.
 *
 * The conformance suite (executor-conformance.ts) is the acceptance test for
 * the AgentEvent protocol — but until this gate, running it was convention:
 * each existing adapter does, yet nothing forced adapter N+1 to. This test
 * converts the convention into CI:
 *
 *   1. Scan packages/*\/src for Executor implementations
 *      (`implements Executor`, `new () => Executor`, `: Executor =`).
 *   2. For each implementing package, require its test files to call
 *      `runExecutorConformance(` or the full `assertTextStream` /
 *      `assertObjectStream` / `assertErrorStream` trio.
 *   3. Pin the scanner itself against the known-implementation inventory —
 *      a regex that rots into matching nothing would otherwise pass
 *      vacuously.
 *
 * Python adapters are out of scope here (TS file scan); their conformance
 * usage lives in prompt-core-python's executor_conformance module and the
 * per-adapter pytest suites.
 */
import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const PACKAGES_DIR = path.resolve(__dirname, "..", "..");
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".stryker-tmp",
  "coverage",
  ".turbo",
]);

const IMPLEMENTATION_PATTERNS = [
  /implements\s+Executor\b/,
  /new\s*\(\)\s*=>\s*Executor\b/,
  /:\s*Executor\s*=/,
];

const CONFORMANCE_CALL = /runExecutorConformance\s*\(/;
const ASSERTION_TRIO = [
  /assertTextStream\s*\(/,
  /assertObjectStream\s*\(/,
  /assertErrorStream\s*\(/,
];

function walk(dir: string, out: string[] = []): string[] {
  // Vanishing entries are expected: cli tests churn tmp-* fixture dirs and
  // the scaffold regression test creates/deletes a probe package — both can
  // run concurrently with this scan under `turbo test`. A dir or file that
  // disappears mid-walk is throwaway by definition, never an Executor
  // implementation.
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith("tmp-")) {
        walk(path.join(dir, entry.name), out);
      }
    } else if (entry.name.endsWith(".ts")) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/** Read a file, tolerating concurrent deletion (see walk). */
function readSafe(file: string): string {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

interface PackageScan {
  name: string;
  implementationFiles: string[];
  testCorpus: string;
}

function scanPackages(): PackageScan[] {
  const scans: PackageScan[] = [];
  for (const entry of fs.readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("tmp-")) continue;
    const pkgDir = path.join(PACKAGES_DIR, entry.name);
    const srcDir = path.join(pkgDir, "src");
    if (!fs.existsSync(srcDir)) continue;

    const srcFiles = walk(srcDir).filter(
      (f) => !f.endsWith(".test.ts") && !f.endsWith(".spec.ts")
    );
    const implementationFiles = srcFiles.filter((f) => {
      const content = readSafe(f);
      return IMPLEMENTATION_PATTERNS.some((p) => p.test(content));
    });
    if (implementationFiles.length === 0) continue;

    const testFiles = walk(pkgDir).filter(
      (f) => f.endsWith(".test.ts") || f.endsWith(".spec.ts")
    );
    const testCorpus = testFiles.map(readSafe).join("\n");

    scans.push({
      name: entry.name,
      implementationFiles: implementationFiles.map((f) =>
        path.relative(PACKAGES_DIR, f)
      ),
      testCorpus,
    });
  }
  return scans;
}

const scans = scanPackages();

describe("executor conformance meta-gate", () => {
  it("scanner finds the known Executor implementations (self-check)", () => {
    // If a refactor moves/renames implementations, update this inventory —
    // it exists so the gate can't rot into passing vacuously.
    const found = scans.map((s) => s.name).sort();
    for (const known of [
      "ai-sdk-shared",
      "ai-sdk-v4-adapter",
      "ai-sdk-v5-adapter",
      "claude-agent-sdk-v0-adapter",
      "mastra-v0-adapter",
      "prompt-core",
    ]) {
      expect(found, `scanner lost track of ${known}`).toContain(known);
    }
  });

  for (const scan of scans) {
    it(`${scan.name} runs the executor conformance suite`, () => {
      const hasConformance =
        CONFORMANCE_CALL.test(scan.testCorpus) ||
        ASSERTION_TRIO.every((p) => p.test(scan.testCorpus));

      expect(
        hasConformance,
        `Package "${scan.name}" implements the Executor protocol ` +
          `(${scan.implementationFiles.join(", ")}) but its tests never ` +
          `invoke the conformance suite. Add a test that calls ` +
          `runExecutorConformance(executor, { text, object, errorInput }) ` +
          `— see mastra-v0-adapter/test/executor.test.ts or ` +
          `claude-agent-sdk-v0-adapter/test/executor-conformance.test.ts ` +
          `for the pattern.`
      ).toBe(true);
    });
  }
});
