import baseConfig from "@agentmark-ai/eslint-config";

export default [
  ...baseConfig,
  {
    // Apply to all TypeScript files in this directory
    files: ["**/*.ts", "**/*.tsx"],
  },
];

