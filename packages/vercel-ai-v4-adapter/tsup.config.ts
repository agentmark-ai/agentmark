import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  target: 'es2019',
  treeshake: true,
  outExtension({ format }) {
    return {
      js: format === 'cjs' ? '.cjs' : '.js'
    }
  },
  esbuildOptions(options) {
    options.mainFields = ['module', 'main']
    options.platform = 'node'
  },
});