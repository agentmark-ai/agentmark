import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stryker (inPlace mode) keeps a backup copy of the project under
    // .stryker-tmp/; without this exclude, vitest discovers and runs those
    // copied test files too, which breaks fixture-relative paths.
    exclude: [...configDefaults.exclude, "**/.stryker-tmp/**"],
    // Real-tsc type tests: *.test-d.ts files pin the prompt-object type
    // flow (dict -> format() -> SDK params) and import the src
    // sdk-contract-assertions so the upstream-rename tripwires are
    // semantically checked in CI (tsup's dts bundling only follows the
    // entry import graph and is not a full checker).
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      // The package tsconfig only includes src/ (tsup build scope) — point
      // tsc at a config that can actually SEE the type tests, otherwise
      // they pass vacuously.
      tsconfig: "./tsconfig.vitest.json",
    },
    // Run test files sequentially to prevent race conditions with fixture cleanup
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.{test,spec}.{ts,tsx}',
        // Type-only modules (compile-time contract pins) have no executable
        // statements — including them puts erased code into the coverage
        // denominator as a permanently-0% file.
        'src/sdk-contract-assertions.ts',
      ],
    },
  },
});
