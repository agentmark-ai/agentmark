import { defineConfig } from 'vitest/config';
import path from 'path';

// `dedupe` collapses multiple hoisted copies of these packages to a single
// resolution per test run. Without it, MUI / emotion / react get pulled
// from whichever app's `node_modules` happens to be in scope when an
// internal subpath import re-resolves — and that mixed-copy state breaks
// React hooks at render time.
const DEDUPE = [
  'react',
  'react-dom',
  '@mui/material',
  '@mui/system',
  '@mui/styled-engine',
  '@mui/utils',
  '@mui/private-theming',
  '@emotion/react',
  '@emotion/styled',
  '@emotion/cache',
];

export default defineConfig({
  test: {
    globals: true,
    // Default to node env (matches the existing pure-logic test convention).
    // Component tests opt in per-file via `// @vitest-environment jsdom`.
    environment: 'node',
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    server: {
      deps: {
        // Force MUI / emotion through Vite's transformer so they go through
        // the deduped resolver instead of bypassing it via Node CJS lookup.
        inline: [/@mui\//, /@emotion\//],
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: DEDUPE,
  },
});
