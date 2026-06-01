import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // vitest 4 no longer auto-clears a spy's call history when it is re-created
    // via `vi.spyOn` in a `beforeEach`, so suites that assert on
    // `spy.mock.calls[0]` would otherwise read a prior test's call. Clear call
    // history + results before each test to restore that per-test isolation.
    clearMocks: true,
  },
});
