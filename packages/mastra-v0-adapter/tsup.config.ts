import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/runner.ts"],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ["esm", "cjs"],
  target: "es2020",
});
