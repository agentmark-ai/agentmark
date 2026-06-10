import { defineConfig } from 'tsup';

export default defineConfig({
  // trace-io is a separate entry so browser-facing consumers can import it
  // WITHOUT the barrel, whose generate-types re-export drags Node-only deps
  // (fs, prettier, json-schema-to-typescript) into client bundles.
  entry: ['src/index.ts', 'src/trace-io.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ['esm', 'cjs'],
  minify: false,
  target: 'es2019',
});