import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['esm'],
    minify: false,
    target: 'es2020',
  },
  {
    entry: ['src/bin.ts'],
    splitting: false,
    sourcemap: true,
    clean: false, // Don't clean - index.ts build handles that
    dts: true,
    format: ['esm'],
    minify: false,
    target: 'es2020',
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
