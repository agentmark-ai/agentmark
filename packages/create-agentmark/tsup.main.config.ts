import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "es2020",
  banner: {
    js: "#!/usr/bin/env node",
  },
});
