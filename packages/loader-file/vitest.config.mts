import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run files sequentially because they manipulate a shared temp-dir
    // fixture under os.tmpdir(); parallel runs can race on cleanup.
    fileParallelism: false,
  },
});
