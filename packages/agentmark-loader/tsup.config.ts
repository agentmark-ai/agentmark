// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false, // Loaders typically don't need TypeScript declarations
  format: ['cjs'], // Output only CommonJS format
  minify: false,
  target: 'es2019',
  shims: false,
  noExternal: [
    // List dependencies to bundle
    // Or use 'all' to bundle all dependencies
    'all', // replace with actual dependencies if needed
  ],
});
