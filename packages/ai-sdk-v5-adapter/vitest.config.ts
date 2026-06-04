import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Stryker (inPlace mode) keeps a backup copy of the project under
    // .stryker-tmp/; without this exclude, vitest discovers and runs those
    // copied test files too, which breaks fixture-relative paths.
    exclude: [...configDefaults.exclude, "**/.stryker-tmp/**"],
    // Run test files sequentially to prevent race conditions with fixture cleanup
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  },
});
