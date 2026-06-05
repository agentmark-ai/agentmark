import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Real-tsc type tests — see ai-sdk-v5-adapter/vitest.config.ts.
    typecheck: {
      enabled: true,
      include: ["test/**/*.test-d.ts"],
      tsconfig: "./tsconfig.vitest.json",
    },
    environment: "node",
    globals: true,
    // Run test files sequentially to prevent race conditions with fixture cleanup
    fileParallelism: false,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.yalc/**",
      "**/.stryker-tmp/**",
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov", "html", "json-summary"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  },
});


