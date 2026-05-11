import { defineConfig } from 'tsup'

/**
 * Multi-entry build:
 *   - `index`     — the full UI-components barrel (React + MUI; ~880 KB).
 *   - `types`     — pure TS types only; React/MUI/@emotion-free.
 *   - `utilities` — pure helper functions; React/MUI/@emotion-free.
 *
 * Each entry maps to a subpath in the package.json `exports` map so
 * consumers can `import('@agentmark-ai/ui-components/types')` without
 * pulling the main barrel. The React-freedom of the `types` and
 * `utilities` outputs is enforced by
 * `test/exports-map-react-free.test.ts`.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    types: 'src/types/index.ts',
    utilities: 'src/utilities/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  external: ['react'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs']
    return options
  },
})
