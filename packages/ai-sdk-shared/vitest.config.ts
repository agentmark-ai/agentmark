import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // ai-sdk-shared has no unit tests of its own — its executor factory +
    // chunk-adapter logic is exercised end-to-end by the v4/v5 adapter suites.
    // A local config keeps `vitest run` from walking up to the monorepo-root
    // `vitest.config.ts` (whose `projects` reference apps/* that don't exist in
    // the OSS standalone build), and `passWithNoTests` makes the empty run a
    // clean pass instead of a non-zero exit.
    passWithNoTests: true,
  },
});
