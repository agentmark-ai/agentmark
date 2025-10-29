import type { StorybookConfig } from '@storybook/react-vite';
import { join, dirname, resolve } from "path";

/**
 * This function is used to resolve the absolute path of a package.
 * It is needed in projects that use Yarn PnP or are set up within a monorepo.
 */
function getAbsolutePath(value: string): any {
  return dirname(require.resolve(join(value, 'package.json')));
}

const config: StorybookConfig = {
  stories: [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  addons: [
    getAbsolutePath('@chromatic-com/storybook'),
    getAbsolutePath('@storybook/addon-docs'),
    getAbsolutePath("@storybook/addon-a11y"),
    getAbsolutePath("@storybook/addon-vitest"),
  ],
  framework: {
    name: getAbsolutePath('@storybook/react-vite'),
    options: {},
  },
  viteFinal: async (config) => {
    // Ensure config.resolve exists
    config.resolve = config.resolve || {};

    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      "@": resolve(__dirname, "../src"), // 👈 alias '@/...' → 'src/...'
    };
    if (config.build) {
      config.build.rollupOptions = config.build.rollupOptions || {};
      config.build.rollupOptions.external = [
        ...(config.build.rollupOptions.external as string[] || []),
        "refractor/lib/all",
        "refractor/lib/core",
      ];
    }

    return config;
  },
};

export default config;
