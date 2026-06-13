import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Stryker's `inPlace` mutation runs copy the whole package — test files
    // included — into `.stryker-tmp/backup-*`. Without this exclude vitest
    // discovers those duplicate copies and runs the suite twice, corrupting
    // Stryker's per-test coverage attribution so that mutants which ARE killed
    // get reported as survived (artificially depressing the mutation score).
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  },
});

