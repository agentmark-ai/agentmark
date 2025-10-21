import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/file-server.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ['esm', 'cjs'],
  minify: false,
  target: 'es2019',
});