import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    {
      name: "otel-cjs-compat",
      transform(code, id) {
        if (id.includes("traced/index") && code.includes('import("@opentelemetry/api")')) {
          return code.replace(
            'await import("@opentelemetry/api")',
            'require("@opentelemetry/api")'
          );
        }
      },
    },
  ],
  test: {
    globals: true,
  },
});
