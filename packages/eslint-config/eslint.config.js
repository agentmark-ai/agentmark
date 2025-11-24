import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importPlugin from "eslint-plugin-import";

export default [
  // Base recommended rules for JavaScript
  js.configs.recommended,
  
  // Ignore patterns
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },
  
  // JavaScript files configuration
  {
    files: ["**/*.js", "**/*.jsx"],
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  
  // TypeScript files configuration
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      import: importPlugin,
    },
    rules: {
      // Import rules for monorepo
      // Restrict imports from outside workspace, but allow node_modules
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./**/*",
              from: "../../../**/*",
              except: ["**/node_modules/**"],
              message: "Do not import from packages outside of workspace boundaries",
            },
          ],
        },
      ],
      // Unused imports
      "import/no-unused-modules": "off", // Too slow for large codebases
      "import/no-unresolved": "off", // TypeScript handles this
      
      // TypeScript-specific rules - unused vars and imports
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
          caughtErrorsIgnorePattern: "^_",
          // This will catch unused imports as well
          vars: "all",
          args: "all",
        },
      ],
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  // Exclude config files from import restrictions (they often need to import build tools)
  {
    files: ["**/*.config.ts", "**/*.config.js", "**/*.config.mjs", "**/*.config.cjs"],
    rules: {
      "import/no-restricted-paths": "off",
    },
  },
];

