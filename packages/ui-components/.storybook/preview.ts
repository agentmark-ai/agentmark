import type { Preview } from '@storybook/react-vite'
import { SyntaxHighlighter } from '@storybook/components';
(async () => {
  // refractor v5 exposes languages through its package exports
  // (`"./*": "./lang/*.js"`), so import by package specifier (`refractor/scss`)
  // — NOT a hardcoded `../../../node_modules/refractor/lang/scss` path, which
  // breaks under the monorepo's hoisting (refractor resolves at the workspace
  // root, not oss/agentmark/node_modules).
  const { default: scss } = await import("refractor/scss");
  SyntaxHighlighter.registerLanguage("scss", scss);
})();

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
       color: /(background|color)$/i,
       date: /Date$/i,
      },
    },
  },
};

export default preview;