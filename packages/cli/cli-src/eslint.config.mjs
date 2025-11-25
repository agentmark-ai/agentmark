import baseConfig from "@agentmark/eslint-config";

export default [
  ...baseConfig,
  {
    // Apply to all TypeScript files in this directory
    files: ["**/*.ts", "**/*.tsx"],
  },
];

