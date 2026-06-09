import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/pricing.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  format: ['cjs'],
  minify: false,
  target: 'es2019',
});
