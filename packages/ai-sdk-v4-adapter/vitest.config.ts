import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run test files sequentially to prevent race conditions with fixture cleanup
    fileParallelism: false,
  },
});
