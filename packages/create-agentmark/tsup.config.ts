import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: true,
    clean: true,
    sourcemap: true,
    splitting: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
  {
    entry: ["src/utils/examples/templates/index.ts"],
    outDir: "dist/utils/examples/templates",
    format: ["esm"],
    dts: true,
    sourcemap: true,
    splitting: false,
  },
]);
