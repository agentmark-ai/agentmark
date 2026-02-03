import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/utils/examples/templates/index.ts"],
  outDir: "dist/utils/examples/templates",
  format: ["esm"],
  dts: true,
  sourcemap: true,
  splitting: false,
  target: "es2020",
});
