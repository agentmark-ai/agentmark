import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: [
    '@agentmark/agentmark-core',
    '@mastra/core',
    '@ai-sdk/openai',
    'zod',
    'react'
  ],
  esbuildOptions(options) {
    options.conditions = ['module'];
  },
});