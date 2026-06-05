import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // These are OTEL integration tests: they initialize real tracing and use
    // wall-clock sleeps to wait for the BatchSpanProcessor/exporter to flush
    // (e.g. byo-migration ~1.4s, masking-integration up to 3s). With the
    // default 5s cap they run with margin locally but tip over on slower /
    // loaded CI runners (byo-migration hit 5481ms on ubuntu). Give the
    // flush-bound tests headroom; a real hang still fails, just later.
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});






