import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Stryker (inPlace mode) keeps a backup copy of the project under
    // .stryker-tmp/; without this exclude, vitest discovers and runs those
    // copied test files too, which breaks fixture-relative paths.
    exclude: [...configDefaults.exclude, "**/.stryker-tmp/**"],
    globals: true,
    environment: 'node',
    // vitest 4 no longer auto-clears a spy's call history when it is re-created
    // via `vi.spyOn` in a `beforeEach`, so suites that assert on
    // `spy.mock.calls[0]` would otherwise read a prior test's call. Clear call
    // history + results before each test to restore that per-test isolation.
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}'],
    },
  },
});
